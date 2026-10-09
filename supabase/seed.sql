-- supabase/seed.sql   (DEV PROJECT ONLY — run in the SQL Editor)
-- Recreates the four demo families used throughout the PRD, plus staff.
-- Never run on the production project.
-- Run the whole script in ONE SQL Editor query.

create or replace function pg_temp.mk_user(p_email text, p_password text, p_meta jsonb default '{}'::jsonb) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, p_meta, now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, 'email',
          jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), now(), now(), now());
  return v_id;
end $$;

create or replace function pg_temp.promote(p_user uuid, p_role public.user_role, p_name text) returns void
language plpgsql as $$
declare v_fam uuid;
begin
  select family_id into v_fam from public.family_members where profile_id = p_user;
  delete from public.families where id = v_fam;
  update public.profiles set role = p_role, full_name = p_name where id = p_user;
end $$;

do $seed$
declare
  today date := current_date;
  u_admin uuid; u_jess uuid; u_sw uuid; u1 uuid; u2 uuid; u3 uuid; u4 uuid;
  t_th uuid; t_jt uuid; t_sw uuid; t_ds uuid;
  p_math uuid; p_eng uuid; p_read uuid;
  ci1 uuid; ci2 uuid; ci3 uuid; ci4 uuid;
  f1 uuid; f2 uuid; f3 uuid; f4 uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid;
  pay1 uuid; pay2 uuid; pay3 uuid; pay4 uuid; pay5 uuid; pay6 uuid;
  term1 uuid; term2 uuid; term3 uuid; bk uuid; conv uuid;
begin
  -- Staff
  u_admin := pg_temp.mk_user('admin@fairybread.au',   'admin1234', '{"first_name":"Therese","last_name":"Howard"}');
  u_jess  := pg_temp.mk_user('jessica@fairybread.au', 'tutor1234', '{"first_name":"Jessica","last_name":"Taylor"}');
  u_sw    := pg_temp.mk_user('sarah.w@fairybread.au', 'tutor1234', '{"first_name":"Sarah","last_name":"Wilson"}');
  perform pg_temp.promote(u_admin, 'admin',   'Therese Howard');
  perform pg_temp.promote(u_jess,  'teacher', 'Jessica Taylor');
  perform pg_temp.promote(u_sw,    'teacher', 'Sarah Wilson');
  insert into public.teachers (profile_id, name, subjects, color) values (u_admin, 'Therese Howard', '{Mathematics,English}', 'yellow') returning id into t_th;
  insert into public.teachers (profile_id, name, subjects, color) values (u_jess,  'Jessica Taylor', '{Mathematics,English}', 'pink')   returning id into t_jt;
  insert into public.teachers (profile_id, name, subjects, color) values (u_sw,    'Sarah Wilson',   '{English,Reading}',     'teal')   returning id into t_sw;
  insert into public.teachers (name, subjects, color)             values (            'Daniel Smith',   '{Reading}',             'orange') returning id into t_ds;

  -- Parents (trigger creates profile + family for each)
  u1 := pg_temp.mk_user('sarah@example.com',   'demo1234', '{"first_name":"Sarah","last_name":"Johnson","phone":"0400 000 001"}');
  u2 := pg_temp.mk_user('claire@example.com',  'demo1234', '{"first_name":"Claire","last_name":"Brown","phone":"0400 000 002"}');
  u3 := pg_temp.mk_user('james@example.com',   'demo1234', '{"first_name":"James","last_name":"Taylor","phone":"0400 000 003"}');
  u4 := pg_temp.mk_user('michael@example.com', 'demo1234', '{"first_name":"Michael","last_name":"Chen","phone":"0400 000 004"}');
  select family_id into f1 from public.family_members where profile_id = u1;
  select family_id into f2 from public.family_members where profile_id = u2;
  select family_id into f3 from public.family_members where profile_id = u3;
  select family_id into f4 from public.family_members where profile_id = u4;

  -- Programs & classes
  insert into public.programs (name, description, color, sort_order) values
    ('Mathematics', 'Number sense, fractions, and problem-solving foundations.', 'pink', 1) returning id into p_math;
  insert into public.programs (name, description, color, sort_order) values
    ('English', 'Reading comprehension, writing, and vocabulary.', 'teal', 2) returning id into p_eng;
  insert into public.programs (name, description, color, sort_order) values
    ('Reading & Spelling', 'Phonics, fluency, and word patterns for early readers.', 'orange', 3) returning id into p_read;

  insert into public.classes (program_id, teacher_id, day_of_week, start_time, capacity) values (p_math, t_jt, 1, '15:30', 15) returning id into ci1;
  insert into public.classes (program_id, teacher_id, day_of_week, start_time, capacity) values (p_eng,  t_sw, 3, '16:30', 15) returning id into ci2;
  insert into public.classes (program_id, teacher_id, day_of_week, start_time, capacity) values (p_read, t_ds, 4, '16:00', 1)  returning id into ci3;
  insert into public.classes (program_id, teacher_id, day_of_week, start_time, capacity) values (p_math, t_jt, 5, '15:00', 12) returning id into ci4;
  insert into public.class_rates (class_id, price_cents) select id, 5000 from public.classes;
  perform private.generate_class_sessions(12);

  -- Children
  insert into public.children (family_id, given_name, family_name, year_level, school, subjects, preferred_days, goals, notes, enrolled_at)
    values (f1, 'Emma', 'Johnson', 'Year 5', 'Riverside Primary', '{Mathematics,English}', '{Monday,Wednesday}',
            'Build confidence with fractions and improve essay writing.', 'Loves creative challenges; works best in small groups.', now()) returning id into c1;
  insert into public.children (family_id, given_name, family_name, year_level, school, subjects, preferred_days, goals, notes, enrolled_at)
    values (f1, 'Oliver', 'Johnson', 'Year 3', 'Riverside Primary', '{"Reading & Spelling"}', '{Tuesday,Thursday}',
            'Improve reading fluency and spelling.', 'Energetic; responds well to games.', now()) returning id into c2;
  insert into public.children (family_id, given_name, family_name, year_level, school, subjects, preferred_days, goals, notes, enrolled_at)
    values (f2, 'Sophie', 'Brown', 'Year 6', 'St Mary''s College', '{Mathematics,English}', '{Wednesday,Friday}',
            'Prepare for high school; strengthen algebra.', 'Self-motivated and detail-oriented.', now()) returning id into c3;
  insert into public.children (family_id, given_name, family_name, year_level, school, enrolled_at) values (f3, 'Liam', 'Taylor', 'Year 4', 'Northside Primary', now()) returning id into c4;
  insert into public.children (family_id, given_name, family_name, year_level, school, enrolled_at) values (f3, 'Mia',  'Taylor', 'Year 2', 'Northside Primary', now()) returning id into c5;
  insert into public.children (family_id, given_name, family_name, year_level, school)               values (f4, 'Noah', 'Chen',   'Year 1', 'Greenfield Primary')      returning id into c6;
  insert into public.enrolments (child_id, family_id, parent_snapshot, agreed_terms, agreed_privacy, agreed_trampoline, signature_name)
    select id, family_id, '{}'::jsonb, true, true, true, 'Seed Parent' from public.children where enrolled_at is not null;

  -- Paid payments + terms (f1 active/3 left, f2 active/0 left, f3 expired)
  pay1 := gen_random_uuid(); pay2 := gen_random_uuid(); pay3 := gen_random_uuid();
  insert into public.payments (id, family_id, type, status, amount_cents, gst_cents, reference, term_label, recorded_by_admin, reviewed_at) values
    (pay1, f1, 'term', 'paid', 53000, 5300, 'FB-SEED-F1', 'Term 3, 2026', true, now()),
    (pay2, f2, 'term', 'paid', 53000, 5300, 'FB-SEED-F2', 'Term 3, 2026', true, now()),
    (pay3, f3, 'term', 'paid', 53000, 5300, 'FB-SEED-F3', 'Term 2, 2026', true, now());
  insert into public.terms (family_id, status, term_label, start_date, end_date, classes_included, payment_id)
    values (f1, 'active', 'Term 3, 2026', today - 14, today + 56, 10, pay1) returning id into term1;
  insert into public.terms (family_id, status, term_label, start_date, end_date, classes_included, payment_id)
    values (f2, 'active', 'Term 3, 2026', today - 14, today + 56, 10, pay2) returning id into term2;
  insert into public.terms (family_id, status, term_label, start_date, end_date, classes_included, payment_id)
    values (f3, 'expired', 'Term 2, 2026', today - 84, today - 14, 10, pay3) returning id into term3;

  -- f1: 7 credit bookings; f2: 10 for Sophie
  insert into public.class_bookings (family_id, child_id, class_session_id, source, status, credit_consumed, term_id)
    select f1, case when x.n % 2 = 0 then c1 else c2 end, x.id, 'term_credit', 'confirmed', true, term1
      from (select s.id, row_number() over (order by s.starts_at) n from public.class_sessions s
             where s.status = 'scheduled' and s.class_id in (ci1, ci2, ci4)) x where x.n <= 7;
  insert into public.class_bookings (family_id, child_id, class_session_id, source, status, credit_consumed, term_id)
    select f2, c3, x.id, 'term_credit', 'confirmed', true, term2
      from (select s.id, row_number() over (order by s.starts_at) n from public.class_sessions s
             where s.status = 'scheduled' and s.class_id in (ci1, ci2, ci4)) x where x.n <= 10;

  -- f3: 8 historical sessions inside its expired term + attendance
  insert into public.class_sessions (class_id, session_date, starts_at, ends_at, capacity, status)
    select ci4, today - 16 - 8 * g, (today - 16 - 8 * g + time '15:00') at time zone 'Australia/Sydney',
           (today - 16 - 8 * g + time '16:00') at time zone 'Australia/Sydney', 12, 'completed' from generate_series(0, 7) g;
  insert into public.class_bookings (family_id, child_id, class_session_id, source, status, credit_consumed, term_id)
    select f3, c4, s.id, 'term_credit', 'confirmed', true, term3 from public.class_sessions s where s.status = 'completed';
  insert into public.attendance (class_session_id, child_id, status)
    select b.class_session_id, b.child_id, case when row_number() over (order by b.created_at) = 3 then 'absent' else 'present' end::public.attendance_status
      from public.class_bookings b where b.term_id = term3;

  -- f3: one confirmed individual purchase making the Reading class FULL
  pay4 := gen_random_uuid();
  insert into public.payments (id, family_id, type, status, amount_cents, gst_cents, reference, child_id, recorded_by_admin, reviewed_at, details)
    values (pay4, f3, 'individual_class', 'paid', 5000, 500, 'FB-SEED-F3-C', c4, true, now(), '{"subject":"Reading & Spelling"}');
  insert into public.class_bookings (family_id, child_id, class_session_id, source, status, payment_id)
    select f3, c4, s.id, 'individual_purchase', 'confirmed', pay4 from public.class_sessions s
     where s.class_id = ci3 and s.status = 'scheduled' order by s.starts_at limit 1 returning id into bk;
  insert into public.individual_class_purchases (family_id, class_booking_id, payment_id) values (f3, bk, pay4);

  -- Pending payments for the admin queue
  pay5 := gen_random_uuid(); pay6 := gen_random_uuid();
  insert into public.payments (id, family_id, type, status, amount_cents, gst_cents, reference, term_label, proof_path, proof_filename, proof_uploaded_at)
    values (pay5, f4, 'term', 'pending', 53000, 5300, 'FB1004-TERM', 'Term 4, 2026', f4 || '/' || pay5 || '/receipt.jpg', 'receipt.jpg', now());
  insert into public.payments (id, family_id, type, status, amount_cents, gst_cents, reference, child_id, class_session_id, details, proof_path, proof_filename, proof_uploaded_at)
    select pay6, f3, 'individual_class', 'pending', 5000, 500, 'FB1003-CLASS', c5, s.id,
           '{"subject":"Mathematics","tutor":"Jessica Taylor"}'::jsonb, f3 || '/' || pay6 || '/proof.png', 'proof.png', now()
      from public.class_sessions s where s.class_id = ci1 and s.status = 'scheduled' order by s.starts_at limit 1;
  insert into public.class_bookings (family_id, child_id, class_session_id, source, status, payment_id, hold_expires_at)
    select f3, c5, class_session_id, 'individual_purchase', 'pending_payment', pay6, now() + interval '72 hours'
      from public.payments where id = pay6;

  -- Consistent counters + ledger
  update public.terms t set classes_booked =
    (select count(*) from public.class_bookings b where b.term_id = t.id and b.credit_consumed and b.status = 'confirmed');
  update public.class_sessions s set booked_count =
    (select count(*) from public.class_bookings b where b.class_session_id = s.id and b.status in ('confirmed', 'pending_payment'));
  insert into public.term_credit_ledger (term_id, delta, reason) select id, classes_included, 'grant' from public.terms;
  insert into public.term_credit_ledger (term_id, delta, reason, booking_id)
    select term_id, -1, 'booking', id from public.class_bookings where credit_consumed;

  -- A published report, a conversation, a welcome notification
  insert into public.student_reports (child_id, teacher_id, term_label, overall, subjects, strengths, areas, note)
    values (c1, t_jt, 'Term 3, 2026', 4, '[{"subject":"Mathematics","rating":4},{"subject":"English","rating":4}]',
            'Great understanding of equivalent fractions.', 'Keep practising long division.', 'Emma has had a brilliant term!');
  conv := private.ensure_conversation('parent_staff', f1, null, null);
  insert into public.messages (conversation_id, sender_role, sender_name, body, is_reminder) values
    (conv, 'admin',  'Fairybread & Fractions', 'Hi Sarah! Welcome to the portal.', false),
    (conv, 'parent', 'Sarah Johnson',          'Thank you — looking forward to it!', false);
  update public.conversations set last_message_at = now(), last_message_preview = 'Thank you — looking forward to it!' where id = conv;
  perform private.notify_family(f4, 'announcement', 'Welcome to Fairybread & Fractions!',
    'Complete your enrolment to get started.', '/parent/enrol');

  -- Learning Shop: six demo products
  insert into public.shop_products (category, title, description, details, price_cents, stock_quantity, low_stock_threshold, sort_order) values
    ('Workbooks',     'Fractions Fun Workbook',        'Colourful practice pages for fractions.',   'Placeholder long description — replace via Admin → Shop products.', 1800, 40, 5, 1),
    ('Workbooks',     'English Grammar Essentials',    'Grammar basics with worked examples.',       'Placeholder long description.', 2000, 25, 5, 2),
    ('Flash Cards',   'Reading Comprehension Cards',   'Short passages with question prompts.',      'Placeholder long description.', 1400,  3, 5, 3),
    ('Flash Cards',   'Times Tables Mastery Pack',     'Cards for 2× to 12× tables.',               'Placeholder long description.', 1200, 60, 5, 4),
    ('Activity Kits', 'Creative Writing Starter Kit',  'Story starters, prompts and a journal.',    'Placeholder long description.', 2800, 15, 5, 5),
    ('Activity Kits', 'Maths Problem Solving Pack',    'Hands-on puzzles and challenges.',          'Placeholder long description.', 2400,  0, 5, 6);

  -- Three demo shop orders
  perform private.create_shop_order(gen_random_uuid(), 'portal', f1, u1, 'Sarah Johnson',
    jsonb_build_array(jsonb_build_object('product_id', (select id from public.shop_products where title = 'Fractions Fun Workbook'), 'quantity', 2)),
    'cod', '{"name":"Sarah Johnson","address":"12 Example St, Sydney NSW 2000","phone":"0400 000 001","email":"sarah@example.com"}'::jsonb,
    null, null, null);
  perform private.create_shop_order(gen_random_uuid(), 'portal', f4, u4, 'Michael Chen',
    jsonb_build_array(jsonb_build_object('product_id', (select id from public.shop_products where title = 'Times Tables Mastery Pack'), 'quantity', 1)),
    'advance', '{"name":"Michael Chen","address":"4 Sample Rd, Parramatta NSW 2150","phone":"0400 000 004","email":"michael@example.com"}'::jsonb,
    f4 || '/seed-order/receipt.jpg', 'receipt.jpg', null);
  perform private.create_shop_order(gen_random_uuid(), 'guest', null, null, null,
    jsonb_build_array(jsonb_build_object('product_id', (select id from public.shop_products where title = 'English Grammar Essentials'), 'quantity', 1)),
    'cod', '{"name":"Guest Buyer","address":"1 Guest Ln, Newtown NSW 2042","phone":"0400 111 222","email":"guest@example.com"}'::jsonb,
    null, null, 'seed-ip-hash');
end
$seed$;
