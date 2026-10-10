-- 0025_autobook_on_class_create.sql
-- When a new class is added to the timetable, auto-book its sessions for all
-- families that already have an active term and enrolled children.
-- This handles the case where: term payment approved → class added later.

create or replace function public.generate_sessions_for_class(p_class_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_n       int;
  v_class   public.classes;
  v_family  record;
  v_child   record;
  v_session record;
  v_today   date := private.local_today();
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;

  -- Generate sessions for this class within its term window
  perform private.generate_class_sessions(70);
  get diagnostics v_n = row_count;

  select * into v_class from public.classes where id = p_class_id;

  -- Auto-book the new sessions for every family with an active term
  for v_family in
    select distinct t.family_id, t.id as term_id, t.start_date, t.end_date
      from public.terms t
     where t.start_date <= v_today
       and t.end_date    > v_today
       and t.status in ('active', 'scheduled')
  loop
    for v_child in
      select id from public.children
       where family_id = v_family.family_id
         and enrolled_at is not null
         and archived_at is null
    loop
      for v_session in
        select s.id, s.booked_count, s.capacity
          from public.class_sessions s
         where s.class_id    = p_class_id
           and s.session_date >= v_family.start_date
           and s.session_date <  v_family.end_date
           and s.status       = 'scheduled'
           and s.starts_at    > now()
           and s.booked_count < s.capacity
           and not exists (
             select 1 from public.class_bookings b
              where b.child_id         = v_child.id
                and b.class_session_id = s.id
                and b.status in ('confirmed','pending_payment','waiting_list')
           )
      loop
        insert into public.class_bookings
          (family_id, child_id, class_session_id, source, status, credit_consumed, term_id, created_by)
        values
          (v_family.family_id, v_child.id, v_session.id, 'term_credit', 'confirmed', false,
           v_family.term_id, (select auth.uid()))
        on conflict do nothing;

        update public.class_sessions
           set booked_count = booked_count + 1
         where id = v_session.id;
      end loop;
    end loop;
  end loop;

  return v_n;
end $$;

grant execute on function public.generate_sessions_for_class(uuid) to authenticated;
