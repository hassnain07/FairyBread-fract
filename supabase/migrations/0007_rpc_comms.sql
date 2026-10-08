-- 0007_rpc_comms.sql

create or replace function private.ensure_conversation(
  p_kind public.conversation_kind, p_family uuid, p_teacher uuid, p_actor uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select c.id into v_id from public.conversations c
   where c.kind = p_kind and c.family_id is not distinct from p_family and c.teacher_id is not distinct from p_teacher;
  if v_id is not null then return v_id; end if;
  begin
    insert into public.conversations (kind, family_id, teacher_id, created_by) values (p_kind, p_family, p_teacher, p_actor) returning id into v_id;
  exception when unique_violation then
    select c.id into v_id from public.conversations c
     where c.kind = p_kind and c.family_id is not distinct from p_family and c.teacher_id is not distinct from p_teacher;
  end;
  return v_id;
end $$;

create or replace function public.start_conversation(p_kind public.conversation_kind, p_family_id uuid default null, p_teacher_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_admin boolean := private.is_admin();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_kind = 'parent_staff' then
    if p_family_id is null or not (v_admin or private.is_family_member(p_family_id)) then raise exception 'forbidden' using errcode = '42501'; end if;
    return private.ensure_conversation(p_kind, p_family_id, null, v_uid);
  elsif p_kind = 'parent_teacher' then
    if p_family_id is null or p_teacher_id is null then raise exception 'invalid_input'; end if;
    if not ((private.is_family_member(p_family_id) or p_teacher_id = private.my_teacher_id())
            and private.teacher_teaches_family(p_teacher_id, p_family_id)) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    return private.ensure_conversation(p_kind, p_family_id, p_teacher_id, v_uid);
  else
    if p_teacher_id is null or not (v_admin or p_teacher_id = private.my_teacher_id()) then raise exception 'forbidden' using errcode = '42501'; end if;
    return private.ensure_conversation(p_kind, null, p_teacher_id, v_uid);
  end if;
end $$;

create or replace function public.send_message(p_conversation_id uuid, p_body text, p_is_reminder boolean default false)
returns public.messages language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_c public.conversations; v_msg public.messages;
  v_party public.participant_kind; v_role public.message_sender_role; v_name text;
  v_body text := btrim(coalesce(p_body, ''));
  v_biz text := coalesce(private.setting('business')->>'name', 'Fairybread & Fractions');
begin
  select * into v_c from public.conversations where id = p_conversation_id;
  if not found then raise exception 'conversation_not_found'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'invalid_message'; end if;

  if private.is_admin() and v_c.kind in ('parent_staff', 'teacher_staff') then
    v_party := 'staff'; v_role := 'admin'; v_name := case when v_c.kind = 'parent_staff' then v_biz else 'Admin' end;
  elsif v_c.teacher_id is not null and v_c.teacher_id = private.my_teacher_id() then
    v_party := 'teacher'; v_role := 'teacher'; select name into v_name from public.teachers where id = v_c.teacher_id;
  elsif v_c.family_id is not null and private.is_family_member(v_c.family_id) then
    v_party := 'family'; v_role := 'parent'; select full_name into v_name from public.profiles where id = v_uid;
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.messages (conversation_id, sender_id, sender_role, sender_name, body, is_reminder)
  values (p_conversation_id, v_uid, v_role, coalesce(nullif(v_name, ''), 'Member'), v_body, coalesce(p_is_reminder, false))
  returning * into v_msg;

  update public.conversations set last_message_at = v_msg.created_at, last_message_preview = left(v_body, 140) where id = p_conversation_id;
  insert into public.conversation_reads (conversation_id, party, last_read_at) values (p_conversation_id, v_party, now())
  on conflict (conversation_id, party) do update set last_read_at = excluded.last_read_at;

  if v_party = 'family' then
    if v_c.kind = 'parent_staff' then
      perform private.notify_admins('message_received', 'New message from ' || v_msg.sender_name, left(v_body, 100), '/admin/messages', jsonb_build_object('conversation_id', v_c.id));
    else
      perform private.notify_teacher(v_c.teacher_id, 'message_received', 'New message from ' || v_msg.sender_name, left(v_body, 100), '/teacher/messages', jsonb_build_object('conversation_id', v_c.id));
    end if;
  elsif v_party = 'teacher' then
    if v_c.kind = 'parent_teacher' then
      perform private.notify_family(v_c.family_id, 'message_received', 'New message from ' || v_msg.sender_name, left(v_body, 100), '/parent/messages', jsonb_build_object('conversation_id', v_c.id));
    else
      perform private.notify_admins('message_received', 'New message from ' || v_msg.sender_name, left(v_body, 100), '/admin/messages', jsonb_build_object('conversation_id', v_c.id));
    end if;
  else
    if v_c.kind = 'parent_staff' then
      perform private.notify_family(v_c.family_id, 'message_received', 'New message from ' || v_biz, left(v_body, 100), '/parent/messages', jsonb_build_object('conversation_id', v_c.id));
    else
      perform private.notify_teacher(v_c.teacher_id, 'message_received', 'New message from Admin', left(v_body, 100), '/teacher/messages', jsonb_build_object('conversation_id', v_c.id));
    end if;
  end if;
  return v_msg;
end $$;

create or replace function public.get_conversations()
returns table (id uuid, kind public.conversation_kind, family_id uuid, teacher_id uuid, family_name text, teacher_name text,
               last_message_preview text, last_message_at timestamptz, unread_count bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, c.family_id, c.teacher_id, f.parent_name, t.name, c.last_message_preview, c.last_message_at,
         case when me.party is null then 0::bigint else (
           select count(*) from public.messages m
            where m.conversation_id = c.id
              and m.created_at > coalesce((select cr.last_read_at from public.conversation_reads cr
                                            where cr.conversation_id = c.id and cr.party = me.party), '-infinity'::timestamptz)
              and m.sender_role <> me.sender) end
  from public.conversations c
  left join public.families f on f.id = c.family_id
  left join public.teachers t on t.id = c.teacher_id
  cross join lateral (select
      case when private.is_admin() and c.kind in ('parent_staff','teacher_staff') then 'staff'::public.participant_kind
           when private.my_family_id() is not null and c.family_id = private.my_family_id() then 'family'::public.participant_kind
           when private.my_teacher_id() is not null and c.teacher_id = private.my_teacher_id() then 'teacher'::public.participant_kind end as party,
      case when private.is_admin() and c.kind in ('parent_staff','teacher_staff') then 'admin'::public.message_sender_role
           when private.my_family_id() is not null and c.family_id = private.my_family_id() then 'parent'::public.message_sender_role
           when private.my_teacher_id() is not null and c.teacher_id = private.my_teacher_id() then 'teacher'::public.message_sender_role end as sender) me
  where private.is_admin()
     or (private.my_family_id()  is not null and c.family_id  = private.my_family_id())
     or (private.my_teacher_id() is not null and c.teacher_id = private.my_teacher_id())
  order by c.last_message_at desc nulls last
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_c public.conversations; v_party public.participant_kind;
begin
  select * into v_c from public.conversations where id = p_conversation_id;
  if not found then raise exception 'conversation_not_found'; end if;
  if private.is_admin() and v_c.kind in ('parent_staff','teacher_staff') then v_party := 'staff';
  elsif v_c.teacher_id is not null and v_c.teacher_id = private.my_teacher_id() then v_party := 'teacher';
  elsif v_c.family_id is not null and private.is_family_member(v_c.family_id) then v_party := 'family';
  else return; end if;
  insert into public.conversation_reads (conversation_id, party, last_read_at) values (p_conversation_id, v_party, now())
  on conflict (conversation_id, party) do update set last_read_at = now();
end $$;

create or replace function public.mark_all_notifications_read() returns int
language sql security definer set search_path = '' as $$
  with u as (update public.notifications set read_at = now()
              where recipient_id = (select auth.uid()) and read_at is null returning 1)
  select count(*)::int from u
$$;

create or replace function public.register_device(p_token text, p_platform public.device_platform,
                                                  p_app_version text default null, p_locale text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.user_devices (profile_id, fcm_token, platform, app_version, locale)
  values ((select auth.uid()), p_token, p_platform, p_app_version, p_locale)
  on conflict (fcm_token) do update
     set profile_id = excluded.profile_id, platform = excluded.platform, app_version = excluded.app_version,
         locale = excluded.locale, last_seen_at = now(), disabled_at = null;
end $$;

create or replace function public.unregister_device(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.user_devices where fcm_token = p_token and profile_id = (select auth.uid())
$$;

create or replace function public.admin_dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := private.local_today(); v_label text := private.setting('business')->>'current_term_label';
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'active_students', (select count(distinct c.id) from public.children c
                         join public.terms t on t.family_id = c.family_id and t.start_date <= v_today and t.end_date > v_today
                        where c.enrolled_at is not null and c.archived_at is null),
    'upcoming_assessments', (select count(*) from public.assessments where status = 'scheduled' and scheduled_date >= v_today),
    'classes_today',        (select count(*) from public.class_sessions where session_date = v_today and status = 'scheduled'),
    'pending_payments',     (select count(*) from public.payments where status = 'pending'),
    'reports_due',          (select count(distinct b.child_id) from public.class_bookings b
                              join public.class_sessions s on s.id = b.class_session_id
                             where b.status = 'confirmed' and s.session_date >= v_today - 70
                               and not exists (select 1 from public.student_reports r
                                                where r.child_id = b.child_id and r.term_label = v_label and r.status = 'published')),
    'revenue_this_month_cents', (select coalesce(sum(total_cents), 0) from public.payments
                                  where status = 'paid' and date_trunc('month', created_at) = date_trunc('month', now())),
    'weekly_attendance', (select coalesce(jsonb_agg(jsonb_build_object('week', w.wk, 'rate', w.rate) order by w.wk), '[]'::jsonb)
                            from (select date_trunc('week', s.session_date)::date as wk,
                                         round(100.0 * count(*) filter (where a.status in ('present','late')) / nullif(count(*), 0)) as rate
                                    from public.attendance a join public.class_sessions s on s.id = a.class_session_id
                                   where s.session_date >= v_today - 84 group by 1) w)
  );
end $$;

-- ── Triggers ─────────────────────────────────────────────────────────────────
create or replace function private.on_report_published() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_family uuid; v_child text; v_teacher text;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
    select family_id, given_name into v_family, v_child from public.children where id = new.child_id;
    select name into v_teacher from public.teachers where id = new.teacher_id;
    perform private.notify_family(v_family, 'report_ready', 'New report available',
      format('%s''s progress report from %s is ready to view.', v_child, v_teacher),
      '/parent/reports', jsonb_build_object('report_id', new.id, 'child_id', new.child_id), 'report:' || new.id);
  end if;
  return new;
end $$;
create trigger student_reports_published before insert or update on public.student_reports
  for each row execute function private.on_report_published();

create or replace function private.on_class_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.day_of_week, new.start_time, new.duration_minutes, new.capacity, new.is_active)
     is distinct from (old.day_of_week, old.start_time, old.duration_minutes, old.capacity, old.is_active) then
    delete from public.class_sessions
     where class_id = new.id and session_date >= private.local_today() and booked_count = 0 and status = 'scheduled'
       and not exists (select 1 from public.class_bookings b where b.class_session_id = class_sessions.id and b.status = 'waiting_list');
    update public.class_sessions set capacity = new.capacity
     where class_id = new.id and session_date >= private.local_today() and status = 'scheduled';
    if new.is_active then perform private.generate_class_sessions(); end if;
  end if;
  return new;
end $$;
create trigger classes_after_update after update on public.classes
  for each row execute function private.on_class_changed();

create or replace function private.on_class_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_active then perform private.generate_class_sessions(); end if;
  return new;
end $$;
create trigger classes_after_insert after insert on public.classes
  for each row execute function private.on_class_created();
