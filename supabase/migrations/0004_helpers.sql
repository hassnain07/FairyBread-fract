-- 0004_helpers.sql
-- All helpers are SECURITY DEFINER with an empty search_path so they cannot be hijacked.

create or replace function private.setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.app_settings where key = p_key
$$;

create or replace function private.local_today() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce(private.setting('business')->>'timezone', 'Australia/Sydney'))::date
$$;

create or replace function private.fmt_ts(p_ts timestamptz) returns text
language sql stable security definer set search_path = '' as $$
  select to_char(p_ts at time zone coalesce(private.setting('business')->>'timezone', 'Australia/Sydney'),
                 'FMDy FMDD FMMon, FMHH12:MI AM')
$$;

-- ── Who am I? ─────────────────────────────────────────────────────────────────
create or replace function private.user_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.is_active
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.user_role() = 'admin', false)
$$;

create or replace function private.my_family_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select fm.family_id from public.family_members fm
  where fm.profile_id = (select auth.uid()) limit 1
$$;

create or replace function private.my_teacher_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.teachers t
  where t.profile_id = (select auth.uid()) and t.is_active limit 1
$$;

create or replace function private.is_family_member(p_family uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.family_members fm
                 where fm.family_id = p_family and fm.profile_id = (select auth.uid()))
$$;

-- ── Teacher visibility ────────────────────────────────────────────────────────
create or replace function private.teacher_owns_session(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.class_sessions s join public.classes c on c.id = s.class_id
                 where s.id = p_session and c.teacher_id = private.my_teacher_id())
$$;

create or replace function private.teacher_has_child(p_child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.my_teacher_id() is not null and (
    exists (select 1 from public.class_bookings b
            join public.class_sessions s on s.id = b.class_session_id
            join public.classes c on c.id = s.class_id
            where b.child_id = p_child and b.status = 'confirmed' and c.teacher_id = private.my_teacher_id())
    or exists (select 1 from public.assessments a
               where a.child_id = p_child and a.teacher_id = private.my_teacher_id())
  )
$$;

create or replace function private.teacher_teaches_family(p_teacher uuid, p_family uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.class_bookings b
                 join public.class_sessions s on s.id = b.class_session_id
                 join public.classes c on c.id = s.class_id
                 where b.family_id = p_family and b.status = 'confirmed' and c.teacher_id = p_teacher)
      or exists (select 1 from public.assessments a where a.family_id = p_family and a.teacher_id = p_teacher)
$$;

-- ── Pricing (single source of truth) ─────────────────────────────────────────
create or replace function private.calc_price(
  p_type public.payment_type, p_family uuid, out amount_cents int, out gst_cents int
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_pr jsonb := private.setting('pricing');
  v_amt int;
begin
  if p_type = 'term' then
    v_amt := (v_pr->>'term_base_cents')::int
           + case when (v_pr->>'registration_fee_every_term')::boolean
                    or not exists (select 1 from public.terms where family_id = p_family)
                  then (v_pr->>'registration_fee_cents')::int else 0 end;
  elsif p_type = 'individual_class' then
    v_amt := (v_pr->>'individual_class_cents')::int;
  else
    v_amt := (v_pr->>'assessment_cents')::int;
  end if;
  amount_cents := v_amt;
  gst_cents    := round(v_amt * (v_pr->>'gst_rate')::numeric)::int;
end $$;

-- ── Notification fan-out ──────────────────────────────────────────────────────
create or replace function private.notif_category(p_type public.notification_type) returns text
language sql immutable set search_path = '' as $$
  select case p_type::text
    when 'booking_confirmed'    then 'new_bookings'
    when 'waitlist_spot_open'   then 'new_bookings'
    when 'enrolment_completed'  then 'new_bookings'
    when 'booking_cancelled'    then 'cancellations'
    when 'session_cancelled'    then 'cancellations'
    when 'payment_received'     then 'payments'
    when 'payment_approved'     then 'payments'
    when 'payment_rejected'     then 'payments'
    when 'report_ready'         then 'reports'
    when 'term_expiring'        then 'reminders'
    when 'session_reminder'     then 'reminders'
    when 'assessment_confirmed' then 'reminders'
    when 'message_received'     then 'messages'
    else 'announcements' end
$$;

create or replace function private.notify(
  p_recipient uuid, p_family uuid, p_type public.notification_type,
  p_title text, p_body text, p_action_url text,
  p_data jsonb default '{}'::jsonb, p_dedupe text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_in_app boolean := true;
  v_push   boolean := true;
begin
  select np.in_app_enabled, np.push_enabled into v_in_app, v_push
  from public.notification_preferences np
  where np.profile_id = p_recipient and np.category = private.notif_category(p_type);
  v_in_app := coalesce(v_in_app, true);
  v_push   := coalesce(v_push,   true);
  if not v_in_app then return; end if;

  insert into public.notifications
    (recipient_id, family_id, type, title, body, action_url, data, dedupe_key, push_status)
  values
    (p_recipient, p_family, p_type, p_title, p_body, p_action_url, p_data, p_dedupe,
     case when v_push then 'pending'::public.push_status else 'skipped'::public.push_status end)
  on conflict do nothing;
end $$;

create or replace function private.notify_family(
  p_family uuid, p_type public.notification_type, p_title text, p_body text,
  p_action_url text, p_data jsonb default '{}'::jsonb, p_dedupe text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select profile_id from public.family_members where family_id = p_family loop
    perform private.notify(r.profile_id, p_family, p_type, p_title, p_body, p_action_url, p_data, p_dedupe);
  end loop;
end $$;

create or replace function private.notify_admins(
  p_type public.notification_type, p_title text, p_body text,
  p_action_url text, p_data jsonb default '{}'::jsonb, p_dedupe text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.profiles where role = 'admin' and is_active loop
    perform private.notify(r.id, null, p_type, p_title, p_body, p_action_url, p_data, p_dedupe);
  end loop;
end $$;

create or replace function private.notify_teacher(
  p_teacher uuid, p_type public.notification_type, p_title text, p_body text,
  p_action_url text, p_data jsonb default '{}'::jsonb, p_dedupe text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_profile uuid;
begin
  select profile_id into v_profile from public.teachers where id = p_teacher;
  if v_profile is not null then
    perform private.notify(v_profile, null, p_type, p_title, p_body, p_action_url, p_data, p_dedupe);
  end if;
end $$;

-- Fire the push Edge Function right after commit (pg_net is async).
create or replace function private.dispatch_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  if new.push_status <> 'pending' then return new; end if;
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_function_secret';
  if v_url is null then return new; end if;
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
      body    := jsonb_build_object('notification_id', new.id),
      timeout_milliseconds := 5000);
  exception when others then
    null;
  end;
  return new;
end $$;

create trigger notifications_dispatch_push
  after insert on public.notifications
  for each row execute function private.dispatch_push();

create or replace function private.sweep_pending_push() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_function_secret';
  if v_url is null then return; end if;
  if exists (select 1 from public.notifications
             where push_status = 'pending' and push_attempts < 5 and created_at < now() - interval '1 minute') then
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret', v_secret),
      body := jsonb_build_object('sweep', true), timeout_milliseconds := 5000);
  end if;
end $$;

create or replace function public.claim_notification_push(p_id uuid) returns public.notifications
language plpgsql security definer set search_path = '' as $$
declare v public.notifications;
begin
  update public.notifications
     set push_claimed_at = now(), push_attempts = push_attempts + 1
   where id = p_id and push_status = 'pending' and push_attempts < 5
     and (push_claimed_at is null or push_claimed_at < now() - interval '2 minutes')
  returning * into v;
  return v;
end $$;
