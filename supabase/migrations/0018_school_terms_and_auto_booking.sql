-- 0018_school_terms_and_auto_booking.sql
-- 1. Add school_terms table (academic calendar, separate from family terms)
-- 2. Link classes to a school term
-- 3. Change term payment approval to auto-book all sessions in the term window
-- 4. Remove credit-based booking gate (weeks-based display only)

-- ── School terms (academic calendar) ─────────────────────────────────────────
create table public.school_terms (
  id          uuid primary key default gen_random_uuid(),
  label       text not null unique,          -- e.g. "Term 1 2025"
  start_date  date not null,
  end_date    date not null,                 -- exclusive (10 weeks = +70 days)
  is_active   boolean not null default true, -- current/upcoming term
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  check (end_date > start_date)
);

-- Link each class slot to the school term it belongs to
alter table public.classes
  add column school_term_id uuid references public.school_terms(id) on delete set null;

create index classes_school_term_idx on public.classes (school_term_id);

-- ── Auto-book all term sessions on payment approval ───────────────────────────
-- Replace apply_paid_payment: for 'term' type, instead of granting credits,
-- auto-create confirmed bookings for every session in the term window for all
-- enrolled children in the family.

create or replace function private.apply_paid_payment(p_payment_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p           public.payments;
  v_rules     jsonb := private.setting('term_rules');
  v_today     date  := private.local_today();
  v_start     date;
  v_end       date;
  v_term_id   uuid;
  v_child     record;
  v_session   record;
  v_booking   public.class_bookings;
  v_sid       uuid;
  v_b         public.class_bookings;
  v_s         public.class_sessions;
  v_child_name text;
  v_a         public.assessments;
begin
  select * into p from public.payments where id = p_payment_id;

  if p.type = 'term' then
    -- Determine term window (same logic as before)
    select coalesce(max(end_date), v_today) into v_start
      from public.terms where family_id = p.family_id and end_date > v_today;
    v_start := greatest(v_start, v_today);
    v_end   := v_start + ((v_rules->>'weeks')::int * 7);

    -- Create the family term record (no credits — classes_included = 0)
    insert into public.terms
      (family_id, status, term_label, start_date, end_date, classes_included, payment_id)
    values
      (p.family_id,
       (case when v_start > v_today then 'scheduled' else 'active' end)::public.term_status,
       coalesce(p.term_label, private.setting('business')->>'current_term_label'),
       v_start, v_end, 0, p.id)
    returning id into v_term_id;

    -- Auto-book every scheduled session within the term window for every enrolled child
    for v_child in
      select id, given_name from public.children
       where family_id = p.family_id and enrolled_at is not null and archived_at is null
    loop
      for v_session in
        select s.id, s.class_id, s.starts_at, s.capacity, s.booked_count
          from public.class_sessions s
         where s.session_date >= v_start
           and s.session_date <  v_end
           and s.status = 'scheduled'
           and s.starts_at > now()
           and s.booked_count < s.capacity
           and not exists (
             select 1 from public.class_bookings b
              where b.child_id = v_child.id
                and b.class_session_id = s.id
                and b.status in ('confirmed','pending_payment','waiting_list')
           )
      loop
        insert into public.class_bookings
          (family_id, child_id, class_session_id, source, status, credit_consumed, term_id, created_by)
        values
          (p.family_id, v_child.id, v_session.id, 'term_credit', 'confirmed', false, v_term_id, p_actor)
        returning * into v_booking;

        update public.class_sessions
           set booked_count = booked_count + 1
         where id = v_session.id;
      end loop;
    end loop;

    perform private.notify_family(p.family_id, 'payment_approved', 'Term activated',
      format('Your term has been verified. All classes for the term have been booked automatically.'),
      '/parent/bookings', jsonb_build_object('payment_id', p.id, 'term_id', v_term_id));

  elsif p.type = 'individual_class' then
    select class_session_id into v_sid from public.class_bookings where payment_id = p.id;
    if v_sid is not null then
      select * into v_s from public.class_sessions where id = v_sid for update;
      select * into v_b from public.class_bookings where payment_id = p.id for update;
      if v_b.status = 'cancelled' then
        if v_s.status <> 'scheduled' or v_s.booked_count >= v_s.capacity then raise exception 'seat_unavailable'; end if;
        update public.class_sessions set booked_count = booked_count + 1 where id = v_s.id;
      end if;
      update public.class_bookings set status = 'confirmed', hold_expires_at = null where id = v_b.id;
      insert into public.individual_class_purchases (family_id, class_booking_id, payment_id)
      values (p.family_id, v_b.id, p.id) on conflict (class_booking_id) do nothing;
      select given_name into v_child_name from public.children where id = v_b.child_id;
      perform private.notify_family(p.family_id, 'payment_approved', 'Payment approved',
        format('%s''s class on %s is confirmed.', v_child_name, private.fmt_ts(v_s.starts_at)),
        '/parent/bookings', jsonb_build_object('payment_id', p.id, 'booking_id', v_b.id));
    end if;

  elsif p.type = 'assessment' then
    update public.assessments set status = 'scheduled' where payment_id = p.id returning * into v_a;
    if found then
      select given_name into v_child_name from public.children where id = v_a.child_id;
      perform private.notify_family(p.family_id, 'assessment_confirmed', 'Assessment confirmed',
        format('%s''s assessment is booked for %s at %s.', v_child_name,
               to_char(v_a.scheduled_date, 'FMDay FMDD FMMonth'), to_char(v_a.scheduled_time, 'FMHH12:MI AM')),
        '/parent/messages', jsonb_build_object('assessment_id', v_a.id, 'payment_id', p.id));
    end if;
  end if;
end $$;

-- ── Admin: create school term ─────────────────────────────────────────────────
create or replace function public.admin_create_school_term(
  p_label      text,
  p_start_date date,
  p_end_date   date
) returns public.school_terms language plpgsql security definer set search_path = '' as $$
declare v_t public.school_terms;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_label), '') = '' then raise exception 'invalid_input'; end if;
  if p_end_date <= p_start_date then raise exception 'invalid_input'; end if;
  insert into public.school_terms (label, start_date, end_date, created_by)
  values (btrim(p_label), p_start_date, p_end_date, (select auth.uid()))
  returning * into v_t;
  -- Sync current_term_label in business settings
  update public.app_settings
     set value = jsonb_set(value, '{current_term_label}', to_jsonb(btrim(p_label)))
   where key = 'business';
  return v_t;
end $$;

-- ── Admin: create term assessment (for enrolled students) ─────────────────────
create or replace function public.admin_create_term_assessment(
  p_child_id      uuid,
  p_teacher_id    uuid,
  p_date          date,
  p_time          time,
  p_school_term_id uuid default null
) returns public.assessments language plpgsql security definer set search_path = '' as $$
declare
  v_child  public.children;
  v_a      public.assessments;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_child from public.children where id = p_child_id;
  if not found then raise exception 'child_not_found' using errcode = 'P0002'; end if;
  if v_child.enrolled_at is null then raise exception 'child_not_enrolled'; end if;
  insert into public.assessments
    (family_id, child_id, teacher_id, class_id, scheduled_date, scheduled_time, status, created_by)
  values
    (v_child.family_id, p_child_id, p_teacher_id, null, p_date, p_time, 'scheduled',
     (select auth.uid()))
  returning * into v_a;
  return v_a;
end $$;

-- Grant execute to authenticated users
grant execute on function public.admin_create_school_term(text, date, date) to authenticated;
grant execute on function public.admin_create_term_assessment(uuid, uuid, date, time, uuid) to authenticated;
grant select on public.school_terms to authenticated, anon;
