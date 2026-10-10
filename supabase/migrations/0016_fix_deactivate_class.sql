-- 0016_fix_deactivate_class.sql
-- Fix "record s is not assigned yet" error in deactivate_class.
-- The DECLARE block had `s record` as the loop variable, but the EXISTS
-- subquery also aliased class_sessions as `s`, confusing PL/pgSQL's
-- record-structure resolution. Renamed loop variable to `v_sess`.

create or replace function public.deactivate_class(p_class_id uuid, p_cancel_future boolean default false) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_c     public.classes;
  v_sess  record;
  v_n     int := 0;
  v_today date := private.local_today();
begin
  select * into v_c from public.classes where id = p_class_id for update;
  if not found then raise exception 'invalid_input'; end if;

  if not (private.is_admin() or v_c.teacher_id = private.my_teacher_id()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if not p_cancel_future and exists (
    select 1
      from public.class_sessions cs
      join public.class_bookings b on b.class_session_id = cs.id
     where cs.class_id = p_class_id
       and cs.session_date >= v_today
       and cs.status = 'scheduled'
       and b.status in ('confirmed', 'pending_payment')
  ) then
    raise exception 'class_has_bookings';
  end if;

  update public.classes set is_active = false where id = p_class_id;

  for v_sess in
    select id from public.class_sessions
     where class_id = p_class_id
       and session_date >= v_today
       and status = 'scheduled'
     order by starts_at
  loop
    v_n := v_n + private.cancel_session_internal(v_sess.id, 'Class discontinued', (select auth.uid()));
  end loop;

  return v_n;
end $$;
