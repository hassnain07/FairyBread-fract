-- 0019_term_scoped_session_generation.sql
-- When a class has a school_term_id, generate sessions only within that term's
-- start_date..end_date window instead of the global weeks_ahead horizon.

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
    -- date range: use school_term window if linked, else global horizon
    cross join lateral (
      select v_today + g.n as day
        from generate_series(0,
          case
            when c.school_term_id is not null then
              (select (st.end_date - v_today) from public.school_terms st where st.id = c.school_term_id)
            else v_weeks * 7
          end
        ) as g(n)
    ) d
   where c.is_active
     and extract(isodow from d.day) = c.day_of_week
     -- respect term bounds when linked
     and (c.school_term_id is null or exists (
           select 1 from public.school_terms st
            where st.id = c.school_term_id
              and d.day >= st.start_date
              and d.day <  st.end_date
         ))
     and not exists (select 1 from public.closures z where z.closure_date = d.day)
  on conflict (class_id, session_date) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Also generate sessions immediately when a class is created for a specific term
create or replace function public.generate_sessions_for_class(p_class_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.generate_class_sessions(70); -- will be filtered by term bounds above
end $$;

grant execute on function public.generate_sessions_for_class(uuid) to authenticated;
