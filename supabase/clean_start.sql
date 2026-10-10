-- supabase/clean_start.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CLEAN START — run this in the Supabase SQL Editor (DEV project only).
-- Wipes ALL data, then creates a single admin account.
-- After this, the admin logs in, invites tutors, and parents sign up normally.
--
--   Admin login:  admin@fairybread.au  /  admin1234
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. Wipe all data ─────────────────────────────────────────────────────────
truncate table
  public.families,
  public.teachers,
  public.programs,
  public.shop_products,
  public.rate_limit_hits,
  public.audit_log,
  public.notifications
  restart identity cascade;

-- Reset sequences
alter sequence public.family_ref_seq  restart with 1001;
alter sequence public.shop_order_seq  restart with 1001;

-- Remove all auth users (cascades to profiles, family_members, etc.)
delete from auth.users;

-- Null out every profile FK that lacks ON DELETE SET NULL/CASCADE
-- (prevents FK violations when auth.users rows are deleted)
update public.app_settings         set updated_by   = null;
update public.documents            set updated_by   = null;
update public.school_terms         set created_by   = null;
update public.classes              set created_by   = null;
update public.assessments          set created_by   = null;
update public.payments             set submitted_by = null, reviewed_by = null;
update public.term_credit_ledger   set actor_id     = null;
update public.class_bookings       set cancelled_by = null, created_by = null;
update public.attendance           set marked_by    = null;
update public.conversations        set created_by   = null;
update public.shop_orders          set reviewed_by  = null;

-- ── 2. Create the admin user ──────────────────────────────────────────────────
do $$
declare
  v_id   uuid := gen_random_uuid();
  v_fam  uuid;
begin
  -- Insert into auth.users (email already confirmed so login works immediately)
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_id, 'authenticated', 'authenticated',
    'admin@fairybread.au',
    extensions.crypt('admin1234', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
    '{"first_name":"Admin","last_name":"User"}'::jsonb,
    now(), now(), '', '', '', ''
  );

  -- Auth identity (needed for Supabase email login)
  insert into auth.identities (
    id, user_id, provider_id, provider, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', 'admin@fairybread.au', 'email_verified', true),
    now(), now(), now()
  );

  -- The on_auth_user_created trigger fires and creates a profile + family.
  -- Now promote that profile to admin and clean up the auto-created family.
  select family_id into v_fam
    from public.family_members
   where profile_id = v_id;

  delete from public.families where id = v_fam;

  update public.profiles
     set role      = 'admin',
         full_name = 'Admin User'
   where id = v_id;
end $$;

commit;

-- ── Done ──────────────────────────────────────────────────────────────────────
-- STEP-BY-STEP TESTING FLOW
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 1. ADMIN LOGIN
--    Go to /login
--    Email:    admin@fairybread.au
--    Password: admin1234
--
-- 2. ADMIN SETUP (do this before inviting anyone)
--    → Admin → Settings
--      • Set business name, contact email, bank details
--      • Confirm pricing (term fee, individual class fee, GST)
--    → Admin → Programs
--      • Create at least one program (e.g. Mathematics, English)
--    → Admin → Timetable
--      • Create class slots (program + tutor + day + time + capacity)
--
-- 3. INVITE TUTORS
--    → Admin → Tutors → "Invite tutor" button
--      • Enter tutor name, email, subjects
--      • Tutor receives an email invite, clicks the link, sets their password
--      • Tutor logs in at /login and lands on the Teacher portal
--
-- 4. PARENTS SIGN UP
--    → Go to /signup (or the landing page → Get started)
--      • Parent enters name, email, phone, password
--      • They receive an OTP to verify their email
--      • After verification they land on the Parent portal
--
-- 5. PARENT FLOW
--    → Parent → Enrolment  — fill in child details and sign
--    → Parent → Book assessment — pay the assessment fee
--    → Admin approves the assessment payment → Admin → Payments
--    → Parent → Book a class — browse available sessions
--    → Parent pays (term or individual) → Admin approves
--    → Parent → Messages — can message the school
--
-- 6. TUTOR FLOW
--    → Teacher → My classes — see their scheduled sessions
--    → Teacher → Attendance — mark students present/absent
--    → Teacher → Reports — write end-of-term reports
--    → Teacher → Messages — reply to admin messages
--
-- 7. ADMIN ONGOING
--    → Admin → Dashboard — live stats and today's sessions
--    → Admin → Bookings — see all confirmed bookings
--    → Admin → Payments — approve/reject pending payments
--    → Admin → Parents — view all families and their children
--    → Admin → Orders — manage learning shop orders
-- ─────────────────────────────────────────────────────────────────────────────
