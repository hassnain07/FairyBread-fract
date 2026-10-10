-- 0015_session_generation_10_weeks.sql
-- Align session generation horizon with the 10-week term length.

update public.app_settings
   set value = jsonb_set(value, '{weeks_ahead}', '10')
 where key = 'session_generation';

create or replace function private.generate_class_sessions(p_weeks_ahead int default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_weeks int := coalesce(p_weeks_ahead, (private.setting('session_generation')->>'weeks_ahead')::int, 10);
  v_tz    text := coalesce(private.setting('business')->>'timezone', 'Australia/Sydney');
  v_today date := private.local_today();
  v_n     int;
begin
  insert into public.class_sessions (class_id, session_date, starts_at, ends_at, capacity)
  select c.id, d.day,
         (d.day + c.start_time) at time zone v_tz,
         ((d.day + c.start_time) at time zone v_tz) + make_interval(mins => c.duration_minutes),
         c.capacity
    from public.classes c
    cross join lateral (select v_today + g.n as day from generate_series(0, v_weeks * 7) as g(n)) d
   where c.is_active
     and extract(isodow from d.day) = c.day_of_week
     and not exists (select 1 from public.closures z where z.closure_date = d.day)
  on conflict (class_id, session_date) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
