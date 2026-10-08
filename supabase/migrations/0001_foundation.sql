-- 0001_foundation.sql
-- Extensions. pg_cron / pg_net / supabase_vault can also be enabled in Dashboard → Database → Extensions.
create extension if not exists btree_gist  with schema extensions;  -- term-overlap exclusion constraint
create extension if not exists pg_net      with schema extensions;  -- async HTTP to the push Edge Function
create extension if not exists pg_cron;                              -- scheduled jobs
-- Supabase Vault is enabled by default on hosted projects (vault.create_secret(...)).

-- Internal schema: helper functions that must NOT be callable through the REST API.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Deny-by-default for anything created later in this schema.
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public revoke all on tables from anon;

-- ── Enums ─────────────────────────────────────────────────────────────────────
create type public.user_role           as enum ('parent', 'teacher', 'admin');
create type public.payment_type        as enum ('term', 'individual_class', 'assessment');
create type public.payment_status      as enum ('pending', 'paid', 'rejected', 'failed');
create type public.term_status         as enum ('pending_payment', 'scheduled', 'active', 'expired'); -- informational only
create type public.booking_source      as enum ('term_credit', 'individual_purchase');
create type public.booking_status      as enum ('confirmed', 'waiting_list', 'pending_payment', 'cancelled');
create type public.session_status      as enum ('scheduled', 'cancelled', 'completed');
create type public.attendance_status   as enum ('present', 'absent', 'no_show', 'late');
create type public.assessment_status   as enum ('awaiting_payment', 'scheduled', 'completed', 'cancelled');
create type public.report_status       as enum ('draft', 'published');
create type public.message_sender_role as enum ('parent', 'admin', 'teacher', 'system');
create type public.conversation_kind   as enum ('parent_staff', 'parent_teacher', 'teacher_staff');
create type public.participant_kind    as enum ('family', 'teacher', 'staff');
create type public.push_status         as enum ('pending', 'sent', 'failed', 'skipped');
create type public.device_platform     as enum ('web', 'ios', 'android');
create type public.notification_type   as enum (
  'booking_confirmed', 'booking_cancelled', 'session_cancelled', 'waitlist_spot_open',
  'payment_received',  'payment_approved',  'payment_rejected',
  'assessment_confirmed', 'term_expiring', 'session_reminder',
  'report_ready', 'message_received', 'announcement', 'enrolment_completed'
);

-- Generic updated_at trigger
create or replace function private.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
