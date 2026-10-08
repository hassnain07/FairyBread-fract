-- 0011_cron.sql

create or replace function private.generate_class_sessions(p_weeks_ahead int default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_weeks int := coalesce(p_weeks_ahead, (private.setting('session_generation')->>'weeks_ahead')::int, 12);
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

create or replace function private.get_or_create_staff_thread(p_family uuid) returns uuid
language sql security definer set search_path = '' as $$
  select private.ensure_conversation('parent_staff', p_family, null, null)
$$;

create or replace function private.send_term_expiry_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record; v_today date := private.local_today(); v_n int := 0; v_conv uuid; v_body text;
  v_weeks int := (private.setting('term_rules')->>'expiry_warning_weeks')::int;
  v_biz text := coalesce(private.setting('business')->>'name', 'Fairybread & Fractions');
begin
  for r in select t.id, t.family_id, t.end_date, t.classes_remaining from public.terms t
            where t.start_date <= v_today and t.end_date > v_today and t.end_date <= v_today + v_weeks * 7
              and not exists (select 1 from public.term_reminders_sent s where s.term_id = t.id)
              and not exists (select 1 from public.terms n where n.family_id = t.family_id and n.start_date >= t.end_date)
  loop
    insert into public.term_reminders_sent (term_id) values (r.id) on conflict do nothing;
    v_body := format('Your term ends on %s. You have %s unused class credit(s) — credits do not roll over, so book them soon or renew early.',
                     to_char(r.end_date - 1, 'FMDD FMMonth YYYY'), r.classes_remaining);
    perform private.notify_family(r.family_id, 'term_expiring', 'Your term is ending soon', v_body, '/parent/payments',
                                  jsonb_build_object('term_id', r.id), 'term_expiring:' || r.id);
    v_conv := private.get_or_create_staff_thread(r.family_id);
    insert into public.messages (conversation_id, sender_role, sender_name, body, is_reminder) values (v_conv, 'system', v_biz, v_body, true);
    update public.conversations set last_message_at = now(), last_message_preview = left(v_body, 140) where id = v_conv;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function private.send_session_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0;
begin
  for r in select b.id as booking_id, b.family_id, s.id as session_id, s.starts_at, pr.name as subject, ch.given_name
             from public.class_bookings b
             join public.class_sessions s on s.id = b.class_session_id
             join public.classes c on c.id = s.class_id
             join public.programs pr on pr.id = c.program_id
             join public.children ch on ch.id = b.child_id
            where b.status = 'confirmed' and s.status = 'scheduled'
              and s.starts_at > now() and s.starts_at <= now() + interval '24 hours'
              and b.created_at < s.starts_at - interval '24 hours'
  loop
    perform private.notify_family(r.family_id, 'session_reminder', 'Class reminder',
      format('%s has %s on %s.', r.given_name, r.subject, private.fmt_ts(r.starts_at)),
      '/parent/bookings', jsonb_build_object('booking_id', r.booking_id, 'session_id', r.session_id),
      'session_reminder:' || r.booking_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function private.release_expired_holds() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0;
begin
  for r in select b.id, b.class_session_id from public.class_bookings b
            where b.status = 'pending_payment' and b.hold_expires_at < now() loop
    perform 1 from public.class_sessions where id = r.class_session_id for update;
    update public.class_bookings set status = 'cancelled', cancelled_at = now(), credit_restored = false, hold_expires_at = null
     where id = r.id and status = 'pending_payment';
    if found then
      update public.class_sessions set booked_count = greatest(booked_count - 1, 0) where id = r.class_session_id;
      perform private.notify_waitlist(r.class_session_id);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

create or replace function private.refresh_term_statuses() returns void
language sql security definer set search_path = '' as $$
  update public.terms set status = (case when end_date <= private.local_today() then 'expired'
                                         when start_date > private.local_today() then 'scheduled'
                                         else 'active' end)::public.term_status
   where status <> (case when end_date <= private.local_today() then 'expired'
                         when start_date > private.local_today() then 'scheduled'
                         else 'active' end)::public.term_status
$$;

create or replace function private.prune_devices() returns void
language sql security definer set search_path = '' as $$
  delete from public.user_devices where last_seen_at < now() - interval '90 days' or disabled_at < now() - interval '30 days'
$$;

-- pg_cron runs in UTC. Sydney is UTC+10/+11, so these fire at ~07:00–08:00 / ~02:00–03:00 local.
select cron.schedule('fb-generate-sessions',  '0 16 * * *',   $$select private.generate_class_sessions()$$);
select cron.schedule('fb-term-reminders',     '0 21 * * *',   $$select private.send_term_expiry_reminders()$$);
select cron.schedule('fb-session-reminders',  '5 * * * *',    $$select private.send_session_reminders()$$);
select cron.schedule('fb-release-holds',      '*/15 * * * *', $$select private.release_expired_holds()$$);
select cron.schedule('fb-term-status',        '10 15 * * *',  $$select private.refresh_term_statuses()$$);
select cron.schedule('fb-push-sweeper',       '* * * * *',    $$select private.sweep_pending_push()$$);
select cron.schedule('fb-prune-devices',      '30 15 * * 0',  $$select private.prune_devices()$$);

-- Generate the first window immediately.
select private.generate_class_sessions();
