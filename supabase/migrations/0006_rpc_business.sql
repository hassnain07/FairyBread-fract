-- 0006_rpc_business.sql
-- Locking order (prevents deadlocks): class_sessions → terms → class_bookings → payments
-- Error codes: not_authenticated forbidden child_not_found child_not_enrolled session_unavailable
-- session_started session_outside_term no_term_ever term_expired no_credits class_full already_booked
-- booking_not_found already_cancelled payment_not_found payment_not_pending invalid_action
-- proof_missing invalid_input consent_required signature_required seat_unavailable
-- class_has_bookings conversation_not_found invalid_message

-- ── Read helpers ──────────────────────────────────────────────────────────────
create or replace function public.quote_price(p_type public.payment_type, p_family_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v record; v_base int;
begin
  if not (private.is_admin() or private.is_family_member(p_family_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v from private.calc_price(p_type, p_family_id);
  v_base := case p_type
              when 'term' then (private.setting('pricing')->>'term_base_cents')::int
              else v.amount_cents end;
  return jsonb_build_object(
    'base_cents',         v_base,
    'registration_cents', v.amount_cents - v_base,
    'amount_cents',       v.amount_cents,
    'gst_cents',          v.gst_cents,
    'total_cents',        v.amount_cents + v.gst_cents,
    'currency',           'AUD');
end $$;

create or replace function public.get_family_gating(p_family_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := private.local_today(); v_term public.terms; v_state text;
begin
  if not (private.is_admin() or private.is_family_member(p_family_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_term from public.terms
   where family_id = p_family_id and start_date <= v_today and end_date > v_today
   order by start_date desc limit 1;
  v_state := case
    when exists (select 1 from public.terms where family_id = p_family_id and end_date > v_today) then 'ACTIVE_TERM'
    when exists (select 1 from public.terms where family_id = p_family_id)                        then 'TERM_EXPIRED'
    else 'NO_TERM_EVER' end;
  return jsonb_build_object('state', v_state, 'active_term_id', v_term.id,
                            'classes_remaining', coalesce(v_term.classes_remaining, 0), 'end_date', v_term.end_date);
end $$;

-- ── Enrolment ─────────────────────────────────────────────────────────────────
create or replace function public.complete_enrolment(
  p_child_id uuid, p_child jsonb, p_parent jsonb, p_referral text, p_signature text,
  p_agreed_terms boolean, p_agreed_privacy boolean, p_agreed_trampoline boolean
) returns public.children language plpgsql security definer set search_path = '' as $$
declare
  v_child public.children;
  v_hdr   text := nullif(current_setting('request.headers', true), '');
  v_ip    text;
begin
  select * into v_child from public.children where id = p_child_id for update;
  if not found then raise exception 'child_not_found' using errcode = 'P0002'; end if;
  if not (private.is_admin() or private.is_family_member(v_child.family_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not (coalesce(p_agreed_terms,false) and coalesce(p_agreed_privacy,false) and coalesce(p_agreed_trampoline,false)) then
    raise exception 'consent_required';
  end if;
  if char_length(btrim(coalesce(p_signature, ''))) <= 2 then raise exception 'signature_required'; end if;
  if char_length(btrim(coalesce(p_child->>'given_name', ''))) = 0 then raise exception 'invalid_input'; end if;

  update public.children set
    given_name       = btrim(p_child->>'given_name'),
    family_name      = coalesce(btrim(p_child->>'family_name'), family_name),
    preferred_name   = nullif(btrim(coalesce(p_child->>'preferred_name', '')), ''),
    year_level       = coalesce(p_child->>'year_level', year_level),
    school           = coalesce(p_child->>'school', school),
    concern          = coalesce(p_child->>'concern', concern),
    goals            = coalesce(p_child->>'goals', goals),
    notes            = coalesce(p_child->>'notes', notes),
    subjects         = case when p_child ? 'subjects'
                            then array(select jsonb_array_elements_text(p_child->'subjects')) else subjects end,
    preferred_days   = case when p_child ? 'preferred_days'
                            then array(select jsonb_array_elements_text(p_child->'preferred_days')) else preferred_days end,
    enrolled_at      = coalesce(enrolled_at, now())
  where id = p_child_id returning * into v_child;

  update public.families set
    parent_name            = coalesce(nullif(btrim(coalesce(p_parent->>'given_name','') || ' ' || coalesce(p_parent->>'family_name','')), ''), parent_name),
    relationship           = coalesce(p_parent->>'relationship', relationship),
    address                = coalesce(p_parent->>'address', address),
    phone                  = coalesce(p_parent->>'phone1', phone),
    secondary_phone        = coalesce(p_parent->>'phone2', secondary_phone),
    emergency_name         = coalesce(p_parent->>'emergency_name', emergency_name),
    emergency_relationship = coalesce(p_parent->>'emergency_relationship', emergency_relationship),
    emergency_phone        = coalesce(p_parent->>'emergency_phone', emergency_phone),
    referral_source        = coalesce(p_referral, referral_source)
  where id = v_child.family_id;

  if v_hdr is not null then v_ip := split_part(coalesce((v_hdr::json)->>'x-forwarded-for', ''), ',', 1); end if;

  insert into public.enrolments
    (child_id, family_id, parent_snapshot, referral_source, agreed_terms, agreed_privacy, agreed_trampoline,
     terms_doc_version, privacy_doc_version, trampoline_doc_version, signature_name, signed_ip)
  values
    (p_child_id, v_child.family_id, coalesce(p_parent, '{}'::jsonb), p_referral, true, true, true,
     (select version from public.documents where key = 'terms'),
     (select version from public.documents where key = 'privacy'),
     (select version from public.documents where key = 'mini_trampoline'),
     btrim(p_signature), nullif(v_ip, ''));

  perform private.notify_admins('enrolment_completed', 'Enrolment completed',
    format('%s has been enrolled.', v_child.name), '/admin/parents',
    jsonb_build_object('child_id', v_child.id, 'family_id', v_child.family_id));
  return v_child;
end $$;

-- ── Booking by term credit ────────────────────────────────────────────────────
create or replace function public.book_class_session(p_child_id uuid, p_session_id uuid)
returns public.class_bookings language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := (select auth.uid());
  v_today   date := private.local_today();
  v_child   public.children;
  v_session public.class_sessions;
  v_term    public.terms;
  v_exist   public.class_bookings;
  v_booking public.class_bookings;
  v_subject text; v_teacher uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;

  select * into v_child from public.children where id = p_child_id;
  if not found then raise exception 'child_not_found' using errcode = 'P0002'; end if;
  if not (private.is_admin() or private.is_family_member(v_child.family_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_child.enrolled_at is null then raise exception 'child_not_enrolled'; end if;

  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'scheduled' then raise exception 'session_unavailable'; end if;
  if v_session.starts_at <= now() then raise exception 'session_started'; end if;

  select * into v_term from public.terms
   where family_id = v_child.family_id and start_date <= v_today and end_date > v_today
   order by start_date desc limit 1 for update;
  if not found then
    if exists (select 1 from public.terms where family_id = v_child.family_id)
      then raise exception 'term_expired';
      else raise exception 'no_term_ever';
    end if;
  end if;
  if v_term.classes_remaining <= 0 then raise exception 'no_credits'; end if;
  if v_session.session_date >= v_term.end_date then raise exception 'session_outside_term'; end if;

  select * into v_exist from public.class_bookings
   where child_id = p_child_id and class_session_id = p_session_id
     and status in ('confirmed', 'pending_payment', 'waiting_list') for update;
  if found and v_exist.status <> 'waiting_list' then raise exception 'already_booked'; end if;
  if v_session.booked_count >= v_session.capacity then raise exception 'class_full'; end if;

  if found then
    update public.class_bookings
       set status = 'confirmed', source = 'term_credit', credit_consumed = true, term_id = v_term.id,
           hold_expires_at = null, created_by = v_uid
     where id = v_exist.id returning * into v_booking;
  else
    insert into public.class_bookings (family_id, child_id, class_session_id, source, status, credit_consumed, term_id, created_by)
    values (v_child.family_id, p_child_id, p_session_id, 'term_credit', 'confirmed', true, v_term.id, v_uid)
    returning * into v_booking;
  end if;

  update public.class_sessions set booked_count = booked_count + 1 where id = p_session_id;
  update public.terms          set classes_booked = classes_booked + 1 where id = v_term.id;
  insert into public.term_credit_ledger (term_id, delta, reason, booking_id, actor_id)
  values (v_term.id, -1, 'booking', v_booking.id, v_uid);

  select pr.name, c.teacher_id into v_subject, v_teacher
    from public.classes c join public.programs pr on pr.id = c.program_id where c.id = v_session.class_id;

  perform private.notify_family(v_child.family_id, 'booking_confirmed', 'Class booked',
    format('%s''s %s class on %s is confirmed.', v_child.given_name, v_subject, private.fmt_ts(v_session.starts_at)),
    '/parent/bookings', jsonb_build_object('booking_id', v_booking.id, 'session_id', p_session_id));
  perform private.notify_teacher(v_teacher, 'booking_confirmed', 'New student booked',
    format('%s booked your %s class on %s.', v_child.name, v_subject, private.fmt_ts(v_session.starts_at)),
    '/teacher/students', jsonb_build_object('booking_id', v_booking.id, 'session_id', p_session_id));
  return v_booking;
end $$;

create or replace function public.join_waitlist(p_child_id uuid, p_session_id uuid)
returns public.class_bookings language plpgsql security definer set search_path = '' as $$
declare v_child public.children; v_session public.class_sessions; v_b public.class_bookings;
begin
  select * into v_child from public.children where id = p_child_id;
  if not found then raise exception 'child_not_found' using errcode = 'P0002'; end if;
  if not (private.is_admin() or private.is_family_member(v_child.family_id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_child.enrolled_at is null then raise exception 'child_not_enrolled'; end if;
  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'scheduled' then raise exception 'session_unavailable'; end if;
  if v_session.starts_at <= now() then raise exception 'session_started'; end if;
  if exists (select 1 from public.class_bookings where child_id = p_child_id and class_session_id = p_session_id
             and status in ('confirmed','pending_payment','waiting_list')) then
    raise exception 'already_booked';
  end if;
  insert into public.class_bookings (family_id, child_id, class_session_id, source, status, created_by)
  values (v_child.family_id, p_child_id, p_session_id, 'term_credit', 'waiting_list', (select auth.uid()))
  returning * into v_b;
  return v_b;
end $$;

-- ── Cancellation ─────────────────────────────────────────────────────────────
create or replace function private.notify_waitlist(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s public.class_sessions; v_w public.class_bookings; v_subject text; v_child text;
begin
  select * into v_s from public.class_sessions where id = p_session_id;
  if not found or v_s.status <> 'scheduled' or v_s.booked_count >= v_s.capacity or v_s.starts_at <= now() then return; end if;
  select * into v_w from public.class_bookings
   where class_session_id = p_session_id and status = 'waiting_list' order by created_at limit 1;
  if not found then return; end if;
  select pr.name into v_subject from public.classes c join public.programs pr on pr.id = c.program_id where c.id = v_s.class_id;
  select given_name into v_child from public.children where id = v_w.child_id;
  perform private.notify_family(v_w.family_id, 'waitlist_spot_open', 'A spot just opened up!',
    format('A place is now available for %s in %s on %s. Book now before it''s taken.', v_child, v_subject, private.fmt_ts(v_s.starts_at)),
    '/parent/book-class', jsonb_build_object('session_id', p_session_id));
end $$;

create or replace function public.cancel_booking(p_booking_id uuid, p_restore_credit boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := (select auth.uid());
  v_admin   boolean := private.is_admin();
  v_hours   int := (private.setting('term_rules')->>'cancellation_window_hours')::int;
  v_b       public.class_bookings;
  v_s       public.class_sessions;
  v_within  boolean; v_restore boolean; v_released boolean := false;
  v_subject text; v_teacher uuid; v_child text;
begin
  select * into v_b from public.class_bookings where id = p_booking_id;
  if not found then raise exception 'booking_not_found'; end if;
  if not (v_admin or private.is_family_member(v_b.family_id)) then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_s from public.class_sessions where id = v_b.class_session_id for update;
  if v_b.term_id is not null then perform 1 from public.terms where id = v_b.term_id for update; end if;
  select * into v_b from public.class_bookings where id = p_booking_id for update;
  if v_b.status = 'cancelled' then raise exception 'already_cancelled'; end if;
  if v_s.starts_at <= now() and not v_admin then raise exception 'session_started'; end if;

  v_within  := (v_s.starts_at - now()) >= make_interval(hours => v_hours);
  v_restore := v_b.credit_consumed and v_b.source = 'term_credit' and v_b.status = 'confirmed'
               and coalesce(case when v_admin then p_restore_credit end, v_within);

  if v_b.status in ('confirmed', 'pending_payment') then
    update public.class_sessions set booked_count = greatest(booked_count - 1, 0) where id = v_s.id;
    v_released := true;
  end if;
  if v_restore then
    update public.terms set classes_booked = greatest(classes_booked - 1, 0) where id = v_b.term_id;
    insert into public.term_credit_ledger (term_id, delta, reason, booking_id, actor_id)
    values (v_b.term_id, 1, 'cancel_restore', v_b.id, v_uid);
  end if;

  update public.class_bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid,
         credit_restored = v_restore, hold_expires_at = null
   where id = v_b.id;

  select pr.name, c.teacher_id into v_subject, v_teacher
    from public.classes c join public.programs pr on pr.id = c.program_id where c.id = v_s.class_id;
  select given_name into v_child from public.children where id = v_b.child_id;

  perform private.notify_family(v_b.family_id, 'booking_cancelled', 'Booking cancelled',
    format('%s''s %s class on %s was cancelled. %s', v_child, v_subject, private.fmt_ts(v_s.starts_at),
           case when v_restore then 'Your class credit has been returned.'
                when v_b.credit_consumed then 'Cancelled inside the 24-hour window, so the credit was not returned.'
                else '' end),
    '/parent/bookings', jsonb_build_object('booking_id', v_b.id, 'credit_restored', v_restore));
  perform private.notify_teacher(v_teacher, 'booking_cancelled', 'Booking cancelled',
    format('%s cancelled from %s on %s.', v_child, v_subject, private.fmt_ts(v_s.starts_at)),
    '/teacher/students', jsonb_build_object('booking_id', v_b.id));
  perform private.notify_admins('booking_cancelled', 'Booking cancelled',
    format('%s cancelled %s on %s.', v_child, v_subject, private.fmt_ts(v_s.starts_at)),
    '/admin/bookings', jsonb_build_object('booking_id', v_b.id));

  if v_released then perform private.notify_waitlist(v_s.id); end if;
  return jsonb_build_object('credit_restored', coalesce(v_restore, false), 'within_window', v_within);
end $$;

-- ── Payments ──────────────────────────────────────────────────────────────────
create or replace function private.hold_seat(p_family uuid, p_child uuid, p_session uuid, p_payment uuid, p_actor uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_child public.children; v_s public.class_sessions; v_ex public.class_bookings; v_id uuid;
  v_hours int := (private.setting('term_rules')->>'hold_hours')::int;
begin
  select * into v_child from public.children where id = p_child and family_id = p_family;
  if not found then raise exception 'child_not_found' using errcode = 'P0002'; end if;
  if v_child.enrolled_at is null then raise exception 'child_not_enrolled'; end if;
  if not exists (select 1 from public.terms where family_id = p_family) then raise exception 'no_term_ever'; end if;

  select * into v_s from public.class_sessions where id = p_session for update;
  if not found or v_s.status <> 'scheduled' then raise exception 'session_unavailable'; end if;
  if v_s.starts_at <= now() then raise exception 'session_started'; end if;

  select * into v_ex from public.class_bookings
   where child_id = p_child and class_session_id = p_session
     and status in ('confirmed','pending_payment','waiting_list') for update;
  if found and v_ex.status <> 'waiting_list' then raise exception 'already_booked'; end if;
  if v_s.booked_count >= v_s.capacity then raise exception 'class_full'; end if;

  if found then
    update public.class_bookings
       set status = 'pending_payment', source = 'individual_purchase', credit_consumed = false, term_id = null,
           payment_id = p_payment, hold_expires_at = now() + make_interval(hours => v_hours)
     where id = v_ex.id returning id into v_id;
  else
    insert into public.class_bookings
      (family_id, child_id, class_session_id, source, status, payment_id, hold_expires_at, created_by)
    values (p_family, p_child, p_session, 'individual_purchase', 'pending_payment', p_payment,
            now() + make_interval(hours => v_hours), p_actor)
    returning id into v_id;
  end if;
  update public.class_sessions set booked_count = booked_count + 1 where id = p_session;
  return v_id;
end $$;

create or replace function public.submit_payment(
  p_id uuid, p_family_id uuid, p_type public.payment_type,
  p_proof_path text, p_proof_filename text,
  p_child_id uuid default null, p_class_session_id uuid default null,
  p_assessment_date date default null, p_assessment_time time default null
) returns public.payments language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_fam   public.families;
  v_child public.children;
  v_price record;
  v_pay   public.payments;
  v_cfg   jsonb := private.setting('assessment_booking');
  v_details jsonb := '{}'::jsonb;
  v_label text; v_suffix text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not (private.is_admin() or private.is_family_member(p_family_id)) then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_pay from public.payments where id = p_id;
  if found then
    if v_pay.family_id <> p_family_id then raise exception 'forbidden' using errcode = '42501'; end if;
    return v_pay;
  end if;

  if p_proof_path is null or p_proof_path not like (p_family_id::text || '/' || p_id::text || '/%')
     or not exists (select 1 from storage.objects o where o.bucket_id = 'payment-proofs' and o.name = p_proof_path) then
    raise exception 'proof_missing';
  end if;

  select * into v_fam from public.families where id = p_family_id;
  select * into v_price from private.calc_price(p_type, p_family_id);

  if p_type = 'term' then
    v_label  := private.setting('business')->>'current_term_label';
    v_suffix := 'TERM';
  elsif p_type = 'individual_class' then
    v_suffix := 'CLASS';
    select * into v_child from public.children where id = p_child_id and family_id = p_family_id;
    if not found then raise exception 'child_not_found' using errcode = 'P0002'; end if;
    v_details := (
      select jsonb_build_object('child_name', v_child.name, 'subject', pr.name,
               'day', to_char(s.session_date, 'FMDay'), 'time', to_char(c.start_time, 'FMHH12:MI AM'),
               'tutor', t.name, 'starts_at', s.starts_at)
        from public.class_sessions s join public.classes c on c.id = s.class_id
        join public.programs pr on pr.id = c.program_id join public.teachers t on t.id = c.teacher_id
       where s.id = p_class_session_id);
    if v_details is null then raise exception 'session_unavailable'; end if;
  elsif p_type = 'assessment' then
    v_suffix := 'ASSESS';
    select * into v_child from public.children where id = p_child_id and family_id = p_family_id;
    if not found then raise exception 'child_not_found' using errcode = 'P0002'; end if;
    if p_assessment_date is null or p_assessment_time is null or p_assessment_date < private.local_today() then
      raise exception 'invalid_input';
    end if;
    if not (v_cfg->'slots' ? to_char(p_assessment_time, 'HH24:MI')) then raise exception 'invalid_input'; end if;
    v_details := jsonb_build_object('child_name', v_child.name, 'date', p_assessment_date, 'time', p_assessment_time);
  end if;

  insert into public.payments
    (id, family_id, type, status, amount_cents, gst_cents, reference, term_label, child_id, class_session_id,
     details, proof_path, proof_filename, proof_uploaded_at, submitted_by)
  values
    (p_id, p_family_id, p_type, 'pending', v_price.amount_cents, v_price.gst_cents,
     v_fam.reference_code || '-' || v_suffix, v_label, p_child_id, p_class_session_id,
     v_details, p_proof_path, p_proof_filename, now(), v_uid)
  returning * into v_pay;

  if p_type = 'individual_class' then
    perform private.hold_seat(p_family_id, p_child_id, p_class_session_id, p_id, v_uid);
  elsif p_type = 'assessment' then
    insert into public.assessments (family_id, child_id, scheduled_date, scheduled_time, status, payment_id, created_by)
    values (p_family_id, p_child_id, p_assessment_date, p_assessment_time, 'awaiting_payment', p_id, v_uid);
  end if;

  perform private.notify_admins('payment_received', 'New payment to verify',
    format('%s submitted a %s payment of $%s.', v_fam.parent_name, replace(p_type::text, '_', ' '),
           to_char((v_price.amount_cents + v_price.gst_cents) / 100.0, 'FM999990.00')),
    '/admin/payments', jsonb_build_object('payment_id', p_id, 'family_id', p_family_id));
  return v_pay;
end $$;

create or replace function private.apply_paid_payment(p_payment_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments; v_rules jsonb := private.setting('term_rules'); v_today date := private.local_today();
  v_start date; v_end date; v_term uuid; v_sid uuid; v_b public.class_bookings; v_s public.class_sessions;
  v_child text; v_a public.assessments;
begin
  select * into p from public.payments where id = p_payment_id;

  if p.type = 'term' then
    select coalesce(max(end_date), v_today) into v_start from public.terms where family_id = p.family_id and end_date > v_today;
    v_start := greatest(v_start, v_today);
    v_end   := v_start + ((v_rules->>'weeks')::int * 7);
    insert into public.terms (family_id, status, term_label, start_date, end_date, classes_included, payment_id)
    values (p.family_id, (case when v_start > v_today then 'scheduled' else 'active' end)::public.term_status,
            coalesce(p.term_label, private.setting('business')->>'current_term_label'),
            v_start, v_end, (v_rules->>'credits')::int, p.id)
    returning id into v_term;
    insert into public.term_credit_ledger (term_id, delta, reason, actor_id)
    values (v_term, (v_rules->>'credits')::int, 'grant', p_actor);
    perform private.notify_family(p.family_id, 'payment_approved', 'Payment approved',
      format('Your term payment has been verified. %s class credits are ready to use.', v_rules->>'credits'),
      '/parent/payments', jsonb_build_object('payment_id', p.id, 'term_id', v_term));

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

create or replace function private.release_payment_holds(p_payment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_sid uuid; v_b public.class_bookings;
begin
  select class_session_id into v_sid from public.class_bookings where payment_id = p_payment_id and status = 'pending_payment';
  if v_sid is not null then
    perform 1 from public.class_sessions where id = v_sid for update;
    select * into v_b from public.class_bookings where payment_id = p_payment_id and status = 'pending_payment' for update;
    if found then
      update public.class_sessions set booked_count = greatest(booked_count - 1, 0) where id = v_sid;
      update public.class_bookings set status = 'cancelled', cancelled_at = now(), credit_restored = false, hold_expires_at = null
       where id = v_b.id;
      perform private.notify_waitlist(v_sid);
    end if;
  end if;
  update public.assessments set status = 'cancelled' where payment_id = p_payment_id and status = 'awaiting_payment';
end $$;

create or replace function public.verify_payment(p_payment_id uuid, p_action text, p_note text default null)
returns public.payments language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); p public.payments;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'invalid_action'; end if;
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if p.status <> 'pending' then raise exception 'payment_not_pending'; end if;

  if p_action = 'approve' then
    update public.payments set status = 'paid', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
     where id = p.id returning * into p;
    perform private.apply_paid_payment(p.id, v_uid);
  else
    update public.payments set status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
     where id = p.id returning * into p;
    perform private.release_payment_holds(p.id);
    perform private.notify_family(p.family_id, 'payment_rejected', 'Payment could not be verified',
      coalesce(nullif(btrim(p_note), ''), 'We couldn''t verify your payment. Please check the details and submit again.'),
      '/parent/payments', jsonb_build_object('payment_id', p.id));
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'payment.' || p_action, 'payment', p.id::text, jsonb_build_object('note', p_note, 'type', p.type, 'total_cents', p.total_cents));
  return p;
end $$;

create or replace function public.admin_record_payment(
  p_family_id uuid, p_type public.payment_type, p_child_id uuid default null,
  p_class_session_id uuid default null, p_note text default null
) returns public.payments language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_id uuid := gen_random_uuid(); v_fam public.families;
  v_price record; v_pay public.payments;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_type = 'assessment' then raise exception 'invalid_input'; end if;
  select * into v_fam from public.families where id = p_family_id;
  if not found then raise exception 'invalid_input'; end if;
  select * into v_price from private.calc_price(p_type, p_family_id);

  insert into public.payments
    (id, family_id, type, status, amount_cents, gst_cents, reference, term_label, child_id, class_session_id,
     recorded_by_admin, submitted_by, reviewed_by, reviewed_at, review_note, details)
  values
    (v_id, p_family_id, p_type, 'paid', v_price.amount_cents, v_price.gst_cents,
     v_fam.reference_code || '-' || case p_type when 'term' then 'TERM' else 'CLASS' end,
     case when p_type = 'term' then private.setting('business')->>'current_term_label' end,
     p_child_id, p_class_session_id, true, v_uid, v_uid, now(), p_note,
     (select jsonb_build_object('child_name', ch.name) from public.children ch where ch.id = p_child_id))
  returning * into v_pay;

  if p_type = 'individual_class' then
    perform private.hold_seat(p_family_id, p_child_id, p_class_session_id, v_id, v_uid);
  end if;
  perform private.apply_paid_payment(v_id, v_uid);

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'payment.admin_record', 'payment', v_id::text, jsonb_build_object('type', p_type, 'family_id', p_family_id, 'note', p_note));
  return v_pay;
end $$;

create or replace function public.admin_adjust_credits(p_term_id uuid, p_delta int, p_note text)
returns public.terms language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); t public.terms;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_delta = 0 or coalesce(btrim(p_note), '') = '' then raise exception 'invalid_input'; end if;
  select * into t from public.terms where id = p_term_id for update;
  if not found then raise exception 'invalid_input'; end if;
  if t.classes_included + p_delta < t.classes_booked then raise exception 'invalid_input'; end if;
  update public.terms set classes_included = classes_included + p_delta where id = t.id returning * into t;
  insert into public.term_credit_ledger (term_id, delta, reason, actor_id, note) values (t.id, p_delta, 'admin_adjustment', v_uid, p_note);
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'term.adjust_credits', 'term', t.id::text, jsonb_build_object('delta', p_delta, 'note', p_note));
  return t;
end $$;

create or replace function private.cancel_session_internal(p_session_id uuid, p_reason text, p_actor uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_s public.class_sessions; b record; v_n int := 0; v_subject text;
begin
  select * into v_s from public.class_sessions where id = p_session_id for update;
  if not found or v_s.status = 'cancelled' then return 0; end if;
  select pr.name into v_subject from public.classes c join public.programs pr on pr.id = c.program_id where c.id = v_s.class_id;
  update public.class_sessions set status = 'cancelled', cancel_reason = p_reason, booked_count = 0 where id = p_session_id;

  for b in select * from public.class_bookings
            where class_session_id = p_session_id and status in ('confirmed', 'pending_payment', 'waiting_list') order by id for update loop
    if b.credit_consumed then
      update public.terms set classes_booked = greatest(classes_booked - 1, 0) where id = b.term_id;
      insert into public.term_credit_ledger (term_id, delta, reason, booking_id, actor_id) values (b.term_id, 1, 'cancel_restore', b.id, p_actor);
    end if;
    update public.class_bookings
       set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor, credit_restored = b.credit_consumed, hold_expires_at = null
     where id = b.id;
    perform private.notify_family(b.family_id, 'session_cancelled', 'Class cancelled',
      format('The %s class on %s was cancelled%s. %s', v_subject, private.fmt_ts(v_s.starts_at),
             case when p_reason is not null then ' (' || p_reason || ')' else '' end,
             case when b.credit_consumed then 'Your class credit has been returned.'
                  when b.status = 'pending_payment' then 'We''ll be in touch about your payment.' else '' end),
      '/parent/bookings', jsonb_build_object('session_id', p_session_id, 'booking_id', b.id));
    v_n := v_n + 1;
  end loop;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (p_actor, 'session.cancel', 'class_session', p_session_id::text, jsonb_build_object('reason', p_reason, 'bookings_cancelled', v_n));
  return v_n;
end $$;

create or replace function public.cancel_session(p_session_id uuid, p_reason text default null) returns int
language plpgsql security definer set search_path = '' as $$
begin
  if not (private.is_admin() or private.teacher_owns_session(p_session_id)) then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.cancel_session_internal(p_session_id, p_reason, (select auth.uid()));
end $$;

create or replace function public.deactivate_class(p_class_id uuid, p_cancel_future boolean default false) returns int
language plpgsql security definer set search_path = '' as $$
declare v_c public.classes; s record; v_n int := 0; v_today date := private.local_today();
begin
  select * into v_c from public.classes where id = p_class_id for update;
  if not found then raise exception 'invalid_input'; end if;
  if not (private.is_admin() or v_c.teacher_id = private.my_teacher_id()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not p_cancel_future and exists (
       select 1 from public.class_sessions s join public.class_bookings b on b.class_session_id = s.id
        where s.class_id = p_class_id and s.session_date >= v_today and s.status = 'scheduled'
          and b.status in ('confirmed','pending_payment')) then
    raise exception 'class_has_bookings';
  end if;
  update public.classes set is_active = false where id = p_class_id;
  for s in select id from public.class_sessions where class_id = p_class_id and session_date >= v_today and status = 'scheduled' order by starts_at loop
    v_n := v_n + private.cancel_session_internal(s.id, 'Class discontinued', (select auth.uid()));
  end loop;
  return v_n;
end $$;

create or replace function public.save_attendance(p_session_id uuid, p_records jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0; v_uid uuid := (select auth.uid());
begin
  if not (private.is_admin() or private.teacher_owns_session(p_session_id)) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_records) <> 'array' then raise exception 'invalid_input'; end if;
  for r in select x.child_id, x.status from jsonb_to_recordset(p_records) as x(child_id uuid, status public.attendance_status) loop
    if not exists (select 1 from public.class_bookings where class_session_id = p_session_id and child_id = r.child_id and status = 'confirmed') then
      raise exception 'child_not_found' using errcode = 'P0002';
    end if;
    insert into public.attendance (class_session_id, child_id, booking_id, status, marked_by)
    values (p_session_id, r.child_id,
            (select id from public.class_bookings where class_session_id = p_session_id and child_id = r.child_id and status = 'confirmed'),
            r.status, v_uid)
    on conflict (class_session_id, child_id) do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.admin_mark_enrolled(p_child_id uuid, p_note text default null)
returns public.children language plpgsql security definer set search_path = '' as $$
declare c public.children;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.children set enrolled_at = coalesce(enrolled_at, now()) where id = p_child_id returning * into c;
  if not found then raise exception 'child_not_found' using errcode = 'P0002'; end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'child.mark_enrolled', 'child', p_child_id::text, jsonb_build_object('note', p_note));
  return c;
end $$;

create or replace function public.admin_create_family(p_parent_name text, p_email text default null, p_phone text default null)
returns public.families language plpgsql security definer set search_path = '' as $$
declare f public.families;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_parent_name), '') = '' then raise exception 'invalid_input'; end if;
  insert into public.families (parent_name, email, phone) values (btrim(p_parent_name), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''))
  returning * into f;
  return f;
end $$;

create or replace function private.apply_paid_payment(p_payment_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments; v_rules jsonb := private.setting('term_rules'); v_today date := private.local_today();
  v_start date; v_end date; v_term uuid; v_sid uuid; v_b public.class_bookings; v_s public.class_sessions;
  v_child text; v_a public.assessments;
begin
  select * into p from public.payments where id = p_payment_id;
  if p.type = 'term' then
    select coalesce(max(end_date), v_today) into v_start from public.terms where family_id = p.family_id and end_date > v_today;
    v_start := greatest(v_start, v_today);
    v_end   := v_start + ((v_rules->>'weeks')::int * 7);
    insert into public.terms (family_id, status, term_label, start_date, end_date, classes_included, payment_id)
    values (p.family_id, (case when v_start > v_today then 'scheduled' else 'active' end)::public.term_status,
            coalesce(p.term_label, private.setting('business')->>'current_term_label'),
            v_start, v_end, (v_rules->>'credits')::int, p.id)
    returning id into v_term;
    insert into public.term_credit_ledger (term_id, delta, reason, actor_id)
    values (v_term, (v_rules->>'credits')::int, 'grant', p_actor);
    perform private.notify_family(p.family_id, 'payment_approved', 'Payment approved',
      format('Your term payment has been verified. %s class credits are ready to use.', v_rules->>'credits'),
      '/parent/payments', jsonb_build_object('payment_id', p.id, 'term_id', v_term));
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

create or replace function private.release_payment_holds(p_payment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_sid uuid; v_b public.class_bookings;
begin
  select class_session_id into v_sid from public.class_bookings where payment_id = p_payment_id and status = 'pending_payment';
  if v_sid is not null then
    perform 1 from public.class_sessions where id = v_sid for update;
    select * into v_b from public.class_bookings where payment_id = p_payment_id and status = 'pending_payment' for update;
    if found then
      update public.class_sessions set booked_count = greatest(booked_count - 1, 0) where id = v_sid;
      update public.class_bookings set status = 'cancelled', cancelled_at = now(), credit_restored = false, hold_expires_at = null where id = v_b.id;
      perform private.notify_waitlist(v_sid);
    end if;
  end if;
  update public.assessments set status = 'cancelled' where payment_id = p_payment_id and status = 'awaiting_payment';
end $$;

create or replace function public.verify_payment(p_payment_id uuid, p_action text, p_note text default null)
returns public.payments language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); p public.payments;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'invalid_action'; end if;
  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if p.status <> 'pending' then raise exception 'payment_not_pending'; end if;
  if p_action = 'approve' then
    update public.payments set status = 'paid', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note where id = p.id returning * into p;
    perform private.apply_paid_payment(p.id, v_uid);
  else
    update public.payments set status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), review_note = p_note where id = p.id returning * into p;
    perform private.release_payment_holds(p.id);
    perform private.notify_family(p.family_id, 'payment_rejected', 'Payment could not be verified',
      coalesce(nullif(btrim(p_note), ''), 'We couldn''t verify your payment. Please check the details and submit again.'),
      '/parent/payments', jsonb_build_object('payment_id', p.id));
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'payment.' || p_action, 'payment', p.id::text, jsonb_build_object('note', p_note, 'type', p.type, 'total_cents', p.total_cents));
  return p;
end $$;

create or replace function public.admin_record_payment(
  p_family_id uuid, p_type public.payment_type, p_child_id uuid default null,
  p_class_session_id uuid default null, p_note text default null
) returns public.payments language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_id uuid := gen_random_uuid(); v_fam public.families;
  v_price record; v_pay public.payments;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_type = 'assessment' then raise exception 'invalid_input'; end if;
  select * into v_fam from public.families where id = p_family_id;
  if not found then raise exception 'invalid_input'; end if;
  select * into v_price from private.calc_price(p_type, p_family_id);
  insert into public.payments
    (id, family_id, type, status, amount_cents, gst_cents, reference, term_label, child_id, class_session_id,
     recorded_by_admin, submitted_by, reviewed_by, reviewed_at, review_note, details)
  values
    (v_id, p_family_id, p_type, 'paid', v_price.amount_cents, v_price.gst_cents,
     v_fam.reference_code || '-' || case p_type when 'term' then 'TERM' else 'CLASS' end,
     case when p_type = 'term' then private.setting('business')->>'current_term_label' end,
     p_child_id, p_class_session_id, true, v_uid, v_uid, now(), p_note,
     (select jsonb_build_object('child_name', ch.name) from public.children ch where ch.id = p_child_id))
  returning * into v_pay;
  if p_type = 'individual_class' then
    perform private.hold_seat(p_family_id, p_child_id, p_class_session_id, v_id, v_uid);
  end if;
  perform private.apply_paid_payment(v_id, v_uid);
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'payment.admin_record', 'payment', v_id::text, jsonb_build_object('type', p_type, 'family_id', p_family_id, 'note', p_note));
  return v_pay;
end $$;

create or replace function public.admin_adjust_credits(p_term_id uuid, p_delta int, p_note text)
returns public.terms language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); t public.terms;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_delta = 0 or coalesce(btrim(p_note), '') = '' then raise exception 'invalid_input'; end if;
  select * into t from public.terms where id = p_term_id for update;
  if not found then raise exception 'invalid_input'; end if;
  if t.classes_included + p_delta < t.classes_booked then raise exception 'invalid_input'; end if;
  update public.terms set classes_included = classes_included + p_delta where id = t.id returning * into t;
  insert into public.term_credit_ledger (term_id, delta, reason, actor_id, note) values (t.id, p_delta, 'admin_adjustment', v_uid, p_note);
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'term.adjust_credits', 'term', t.id::text, jsonb_build_object('delta', p_delta, 'note', p_note));
  return t;
end $$;

create or replace function private.cancel_session_internal(p_session_id uuid, p_reason text, p_actor uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v_s public.class_sessions; b record; v_n int := 0; v_subject text;
begin
  select * into v_s from public.class_sessions where id = p_session_id for update;
  if not found or v_s.status = 'cancelled' then return 0; end if;
  select pr.name into v_subject from public.classes c join public.programs pr on pr.id = c.program_id where c.id = v_s.class_id;
  update public.class_sessions set status = 'cancelled', cancel_reason = p_reason, booked_count = 0 where id = p_session_id;
  for b in select * from public.class_bookings
            where class_session_id = p_session_id and status in ('confirmed','pending_payment','waiting_list') order by id for update loop
    if b.credit_consumed then
      update public.terms set classes_booked = greatest(classes_booked - 1, 0) where id = b.term_id;
      insert into public.term_credit_ledger (term_id, delta, reason, booking_id, actor_id) values (b.term_id, 1, 'cancel_restore', b.id, p_actor);
    end if;
    update public.class_bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor, credit_restored = b.credit_consumed, hold_expires_at = null where id = b.id;
    perform private.notify_family(b.family_id, 'session_cancelled', 'Class cancelled',
      format('The %s class on %s was cancelled%s. %s', v_subject, private.fmt_ts(v_s.starts_at),
             case when p_reason is not null then ' (' || p_reason || ')' else '' end,
             case when b.credit_consumed then 'Your class credit has been returned.'
                  when b.status = 'pending_payment' then 'We''ll be in touch about your payment.' else '' end),
      '/parent/bookings', jsonb_build_object('session_id', p_session_id, 'booking_id', b.id));
    v_n := v_n + 1;
  end loop;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (p_actor, 'session.cancel', 'class_session', p_session_id::text, jsonb_build_object('reason', p_reason, 'bookings_cancelled', v_n));
  return v_n;
end $$;

create or replace function public.cancel_session(p_session_id uuid, p_reason text default null) returns int
language plpgsql security definer set search_path = '' as $$
begin
  if not (private.is_admin() or private.teacher_owns_session(p_session_id)) then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.cancel_session_internal(p_session_id, p_reason, (select auth.uid()));
end $$;

create or replace function public.deactivate_class(p_class_id uuid, p_cancel_future boolean default false) returns int
language plpgsql security definer set search_path = '' as $$
declare v_c public.classes; s record; v_n int := 0; v_today date := private.local_today();
begin
  select * into v_c from public.classes where id = p_class_id for update;
  if not found then raise exception 'invalid_input'; end if;
  if not (private.is_admin() or v_c.teacher_id = private.my_teacher_id()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not p_cancel_future and exists (
       select 1 from public.class_sessions s join public.class_bookings b on b.class_session_id = s.id
        where s.class_id = p_class_id and s.session_date >= v_today and s.status = 'scheduled'
          and b.status in ('confirmed','pending_payment')) then
    raise exception 'class_has_bookings';
  end if;
  update public.classes set is_active = false where id = p_class_id;
  for s in select id from public.class_sessions where class_id = p_class_id and session_date >= v_today and status = 'scheduled' order by starts_at loop
    v_n := v_n + private.cancel_session_internal(s.id, 'Class discontinued', (select auth.uid()));
  end loop;
  return v_n;
end $$;

create or replace function public.save_attendance(p_session_id uuid, p_records jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0; v_uid uuid := (select auth.uid());
begin
  if not (private.is_admin() or private.teacher_owns_session(p_session_id)) then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_records) <> 'array' then raise exception 'invalid_input'; end if;
  for r in select x.child_id, x.status from jsonb_to_recordset(p_records) as x(child_id uuid, status public.attendance_status) loop
    if not exists (select 1 from public.class_bookings where class_session_id = p_session_id and child_id = r.child_id and status = 'confirmed') then
      raise exception 'child_not_found' using errcode = 'P0002';
    end if;
    insert into public.attendance (class_session_id, child_id, booking_id, status, marked_by)
    values (p_session_id, r.child_id,
            (select id from public.class_bookings where class_session_id = p_session_id and child_id = r.child_id and status = 'confirmed'),
            r.status, v_uid)
    on conflict (class_session_id, child_id) do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.admin_mark_enrolled(p_child_id uuid, p_note text default null)
returns public.children language plpgsql security definer set search_path = '' as $$
declare c public.children;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.children set enrolled_at = coalesce(enrolled_at, now()) where id = p_child_id returning * into c;
  if not found then raise exception 'child_not_found' using errcode = 'P0002'; end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'child.mark_enrolled', 'child', p_child_id::text, jsonb_build_object('note', p_note));
  return c;
end $$;

create or replace function public.admin_create_family(p_parent_name text, p_email text default null, p_phone text default null)
returns public.families language plpgsql security definer set search_path = '' as $$
declare f public.families;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(btrim(p_parent_name), '') = '' then raise exception 'invalid_input'; end if;
  insert into public.families (parent_name, email, phone)
  values (btrim(p_parent_name), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''))
  returning * into f;
  return f;
end $$;
