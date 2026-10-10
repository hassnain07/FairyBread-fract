-- 0026_revert_autobook.sql
-- Revert generate_sessions_for_class to simple session generation only.
-- Parents now book classes explicitly via the Book a Class page.
-- Also revert apply_paid_payment to not auto-book sessions on term approval.

create or replace function public.generate_sessions_for_class(p_class_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform private.generate_class_sessions(70);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Revert apply_paid_payment: term approval grants credits only, no auto-booking
create or replace function private.apply_paid_payment(p_payment_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p         public.payments;
  v_rules   jsonb := private.setting('term_rules');
  v_today   date  := private.local_today();
  v_start   date;
  v_end     date;
  v_term_id uuid;
  v_sid     uuid;
  v_b       public.class_bookings;
  v_s       public.class_sessions;
  v_child   text;
  v_a       public.assessments;
begin
  select * into p from public.payments where id = p_payment_id;

  if p.type = 'term' then
    select coalesce(max(end_date), v_today) into v_start
      from public.terms where family_id = p.family_id and end_date > v_today;
    v_start := greatest(v_start, v_today);
    v_end   := v_start + ((v_rules->>'weeks')::int * 7);

    insert into public.terms
      (family_id, status, term_label, start_date, end_date, classes_included, payment_id)
    values
      (p.family_id,
       (case when v_start > v_today then 'scheduled' else 'active' end)::public.term_status,
       coalesce(p.term_label, private.setting('business')->>'current_term_label'),
       v_start, v_end, (v_rules->>'credits')::int, p.id)
    returning id into v_term_id;

    insert into public.term_credit_ledger (term_id, delta, reason, actor_id)
    values (v_term_id, (v_rules->>'credits')::int, 'grant', p_actor);

    perform private.notify_family(p.family_id, 'payment_approved', 'Term activated',
      format('Your term has been verified. You can now book classes for your children.'),
      '/parent/book-class', jsonb_build_object('payment_id', p.id, 'term_id', v_term_id));

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
      select given_name into v_child from public.children where id = v_b.child_id;
      perform private.notify_family(p.family_id, 'payment_approved', 'Payment approved',
        format('%s''s class on %s is confirmed.', v_child, private.fmt_ts(v_s.starts_at)),
        '/parent/bookings', jsonb_build_object('payment_id', p.id, 'booking_id', v_b.id));
    end if;

  elsif p.type = 'assessment' then
    update public.assessments set status = 'scheduled' where payment_id = p.id returning * into v_a;
    if found then
      select given_name into v_child from public.children where id = v_a.child_id;
      perform private.notify_family(p.family_id, 'assessment_confirmed', 'Assessment confirmed',
        format('%s''s assessment is booked for %s at %s.', v_child,
               to_char(v_a.scheduled_date, 'FMDay FMDD FMMonth'), to_char(v_a.scheduled_time, 'FMHH12:MI AM')),
        '/parent/messages', jsonb_build_object('assessment_id', v_a.id, 'payment_id', p.id));
    end if;
  end if;
end $$;

grant execute on function public.generate_sessions_for_class(uuid) to authenticated;
