# Fairybread & Fractions — Supabase Schema

> **Scope.** The complete, secure Postgres schema for the Fairybread & Fractions platform (web today, React Native later), including RLS, RPC functions, storage, realtime, scheduled jobs and a seed for local testing.
> **Companion file.** `BACKEND_IMPLEMENTATION.md` explains how the frontend connects to this schema, how FCM push works, and how every mock is removed.
> **Derived from.** A full read of `FairyBread-master` (`projectDets/*.md`, `src/types/*`, `DataClient`, mock client and every page) **plus** `SHOP_AND_AUTH_UPDATES.md` (Learning Shop, guest checkout, OTP signup / password reset).

---

## 0. How to use this file (hosted Supabase — SQL Editor, no CLI, no Docker)

1. Create a Supabase project (Postgres 15+): **`fairybread-dev`** for development and, later, **`fairybread-prod`**. Full workflow, dashboard checklist and email/SMTP warning: `BACKEND_IMPLEMENTATION.md` §2.1.
2. Copy each numbered SQL block into its own file in your repo under `supabase/migrations/` (version control only) in order: `0001_…sql` … `0011_…sql`, then **`0012a_shop_enums.sql`, `0012b_shop.sql` (§13A), `0013_auth_otp_hygiene.sql` (§13B)**.
3. Apply each file in **Dashboard → SQL Editor → New query**: wrap it in `begin;` … `commit;` (all-or-nothing; run `0012a` unwrapped), make sure no text is highlighted (the editor runs only a selection), click Run, then log it in `supabase/MIGRATIONS_LOG.md`. Never edit an applied migration; add a new one.
4. On the **dev project only**, run `seed.sql` (§14). To start over, run `dev_reset.sql` (§14.1) then the seed again.
5. Types are optional: use the dashboard's type generator, or `npx supabase gen types typescript --project-id <ref> > src/lib/data/supabase/database.types.ts` (needs a login token, not Docker), or keep the `Database = any` placeholder.

---

## 1. Design decisions (read first)

| # | Decision | Why |
|---|---|---|
| 1 | **Money is stored as integer cents** (`*_cents`), never floats. `gst_cents` is stored per payment. | The mock uses float dollars; rounding drift is unacceptable for payments. The data layer converts cents ↔ dollars at the edge. |
| 2 | **Prices, GST, credits, weeks, cancellation window, bank details (`public_info`) and shop rules live in `app_settings`**, not in client code. The server computes every payment amount; the client can never choose its own price. | Frontend `config.ts` constants can be tampered with. The PRD requires them to stay configurable (open questions §3.5). |
| 3 | **Roles live in `profiles.role`** (`parent \| teacher \| admin`). A user can never change their own role (column-level grants). Staff accounts are created only by an admin through an Edge Function (service role). | Role escalation is the #1 RLS failure mode. |
| 4 | **Gating is calendar-derived** (`end_date > today`), never from a stored flag. `terms.status` is informational only. | PRD §3.2 rule. Enforced again server-side inside `book_class_session`. |
| 5 | **All credit / seat / payment mutations go through `SECURITY DEFINER` RPCs** that lock rows (`FOR UPDATE`) and run in one transaction. Direct `INSERT/UPDATE/DELETE` on those tables is revoked. | Prevents double-spend and race conditions on credits and capacity. |
| 6 | **Bookings are per dated session** (`class_sessions`), not per recurring class. | The 24-hour cancellation rule, attendance and capacity all need an actual date. The mock's `ClassInstance` becomes `classes` (recurring slot) + generated `class_sessions`. |
| 7 | **The teacher-set class price is in a separate table (`class_rates`)** visible only to admin and the owning teacher. | `TEACHER_PRICE_IS_PARENT_FACING = false`. Column-level hiding is not possible with RLS alone; a separate table is the safe pattern. |
| 8 | **Families can exist without a login** (`families.primary…` is via `family_members`, which may be empty). | PRD: admin books on behalf of "families without portal access". |
| 9 | **Notifications are fan-out rows per recipient profile** with per-user read state and a push-delivery state machine. FCM tokens live in `user_devices`. | Works identically for web and the future React Native app. |
| 10 | **One conversation per party-pair** (parent↔staff, parent↔teacher, teacher↔staff) with party-level read state. | Matches the mock's model; the admin inbox is a shared "staff" inbox, not tied to one admin account. |
| 11 | **Every table has RLS enabled; default is deny.** `anon` has access to almost nothing. | Security baseline. |
| 12 | **Timezone is `Australia/Sydney`** (setting `business.timezone`). `// TODO: confirm with client`. | Needed to compute "today", session start times and the 24h window correctly. |
| 13 | **`terms.end_date` is exclusive.** A term starting 2026-01-05 with 10 weeks ends `2026-03-16`; the last valid day is `2026-03-15`. | Matches the frontend check `new Date(end_date) > now`. |
| 14 | **Early renewal** starts the new term when the current one ends (Phase 1.4 default). Credits never roll over. Overlapping terms are blocked by an exclusion constraint. | `// TODO: confirm with client`. |
| 15 | **Individual-class payments hold a seat** (`pending_payment` booking with an expiry) until the admin approves or the hold lapses. | Otherwise two families can pay for the last seat. |
| 16 | **Learning Shop** (portal + public `/shop`) is a first-class module: `shop_products`, `shop_orders`, `shop_order_items`, with server-side pricing, stock and a status machine (§13A). | Added by `SHOP_AND_AUTH_UPDATES.md`. |
| 17 | **Guest checkout is brokered by an Edge Function**; anonymous users have zero table grants. IP is stored only as a salted hash, for rate limiting. | A public endpoint that writes orders is the most abusable surface in the system. |
| 18 | **Signup and password reset are OTP-based** (6-digit emailed code → session → set password). The first-user trigger (§7) still builds profile + family; an unverified-user purge cleans up abandoned attempts (§13B). | `SHOP_AND_AUTH_UPDATES.md` §12. |
| 19 | **Bank and contact details live in the public setting `public_info`**, not in `business`. | Guests need them at checkout; keeping one copy avoids drift. |

---

## 2. Entity overview

```
auth.users ─1:1─ profiles ─┬─< family_members >─ families ─┬─< children ─< enrolments
                           │                                ├─< terms ─< term_credit_ledger
                           └─1:1─ teachers (staff only)     ├─< payments ──(proof file in Storage)
                                                            ├─< class_bookings >─ class_sessions >─ classes >─ programs
                                                            │                                         └─ class_rates (private price)
                                                            ├─< assessments
                                                            └─< conversations ─< messages
children ─< student_reports (by teacher)      class_sessions ─< attendance
profiles ─< notifications        profiles ─< user_devices (FCM tokens)       profiles ─< notification_preferences
shop_categories ─< shop_products ─< shop_order_items >─ shop_orders >─ families (portal) | guest (family_id null)
app_settings · documents · closures · audit_log · term_reminders_sent
```

### Mapping from the current frontend types

| Frontend type (`src/types`) | Table(s) | Notes |
|---|---|---|
| `Family` | `families` + `family_members` | Gains `parent_name`, `email`, `phone`, `reference_code`. |
| `Child` | `children` (+ `enrolments`) | `enrolled` = `enrolled_at is not null`. `name` is generated from `given_name + family_name`. |
| `Term` | `terms` | `classes_remaining` is a generated column. Money/prices not stored here. |
| `ClassInstance` | `classes` + `programs` + `class_rates` (+ next `class_session`) | `enrolled` ≙ `class_sessions.booked_count`. `price` comes from `class_rates` (admin/teacher only). |
| `ClassBooking` | `class_bookings` | Adds `class_session_id`, `term_id`, `credit_restored`, status `pending_payment`. |
| `Assessment` | `assessments` | `outcome` ≙ `status` (`completed` → `'complete'`, else `'pending'`). |
| `Payment` | `payments` | `type` gains `'assessment'`. Class details move into `details jsonb`. |
| `StudentReport` | `student_reports` | `term` ≙ `term_label`. |
| `Conversation` / `ChatMessage` | `conversations` / `messages` (+ `conversation_reads`) | Participant arrays are built by the data layer. |
| `AppNotification` | `notifications` | Per-recipient; `read` ≙ `read_at is not null`. |
| `getDocuments()` | `documents` + Storage bucket `documents` | |
| (new) | `user_devices`, `notification_preferences`, `attendance`, `closures`, `audit_log` | |
| `ShopProduct` | `shop_products` (+ `shop_categories`) via `get_shop_products()` | Money in cents; `status` derived from stock. See §13A. |
| `ShopOrder` / `ShopOrderItem` / `ShopCartItem` | `shop_orders` / `shop_order_items` / (cart stays local) | `family_id = 'guest'` ⇒ `family_id is null`. |
| (new) | `rate_limit_hits` | Edge-Function rate limiting. |

---

## 3. Migration 0001 — foundation: extensions, schemas, enums

```sql
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
```

---

## 4. Migration 0002 — tables

```sql
-- 0002_tables.sql

-- ── Identity ──────────────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        public.user_role not null default 'parent',
  full_name   text not null default '',
  email       text,
  phone       text,
  avatar_url  text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create sequence public.family_ref_seq start 1001;

create table public.families (
  id                      uuid primary key default gen_random_uuid(),
  reference_code          text not null unique default ('FB' || nextval('public.family_ref_seq')),  -- bank-transfer reference prefix
  parent_name             text not null,
  email                   text,
  phone                   text,
  secondary_phone         text,
  address                 text,
  relationship            text,                      -- parent's relationship to the children
  emergency_name          text,
  emergency_relationship  text,
  emergency_phone         text,
  referral_source         text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index families_email_idx on public.families (lower(email));

-- Logins attached to a family. A family may have zero rows (admin-managed family).
create table public.family_members (
  family_id    uuid not null references public.families(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  relationship text,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (family_id, profile_id),
  unique (profile_id)                       -- one login belongs to exactly one family
);

create table public.teachers (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid unique references public.profiles(id) on delete set null,
  name        text not null,
  initials    text generated always as (
                upper(left(split_part(name, ' ', 1), 1) || left(split_part(name, ' ', 2), 1))
              ) stored,
  subjects    text[] not null default '{}',
  color       text not null default 'pink',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.programs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  description  text,
  color        text not null default 'pink',
  sort_order   int  not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.children (
  id                    uuid primary key default gen_random_uuid(),
  family_id             uuid not null references public.families(id) on delete cascade,
  given_name            text not null check (length(btrim(given_name)) > 0),
  family_name           text not null default '',
  preferred_name        text,
  name                  text generated always as (btrim(given_name || ' ' || family_name)) stored,
  initials              text generated always as (upper(left(given_name, 1) || left(family_name, 1))) stored,
  year_level            text,
  school                text,
  date_of_birth         date,
  concern               text,
  subjects              text[] not null default '{}',
  preferred_days        text[] not null default '{}',
  goals                 text,
  notes                 text,
  preferred_teacher_id  uuid references public.teachers(id) on delete set null,
  sessions_per_week     text,
  enrolled_at           timestamptz,                -- set ONLY by complete_enrolment()
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, family_id)                            -- lets other tables prove child ⇄ family consistency
);
create index children_family_idx on public.children (family_id);

-- Immutable record of what the parent agreed to and signed at enrolment.
create table public.enrolments (
  id                   uuid primary key default gen_random_uuid(),
  child_id             uuid not null references public.children(id) on delete cascade,
  family_id            uuid not null references public.families(id) on delete cascade,
  parent_snapshot      jsonb not null,
  referral_source      text,
  agreed_terms         boolean not null,
  agreed_privacy       boolean not null,
  agreed_trampoline    boolean not null,
  terms_doc_version    int,
  privacy_doc_version  int,
  trampoline_doc_version int,
  signature_name       text not null check (length(btrim(signature_name)) > 2),
  signed_at            timestamptz not null default now(),
  signed_ip            text,
  check (agreed_terms and agreed_privacy and agreed_trampoline)
);
create index enrolments_child_idx on public.enrolments (child_id);

-- ── Settings / content ────────────────────────────────────────────────────────
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  is_public   boolean not null default false,   -- readable by anon
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now()
);

create table public.documents (
  key               text primary key,            -- 'terms' | 'privacy' | 'mini_trampoline'
  storage_path      text not null,
  version           int  not null default 1,
  original_filename text,
  updated_by        uuid references public.profiles(id),
  updated_at        timestamptz not null default now()
);

create table public.closures (                   -- public holidays etc. — no sessions generated
  closure_date date primary key,
  reason       text
);

-- ── Classes ───────────────────────────────────────────────────────────────────
create table public.classes (                    -- recurring weekly slot (was `ClassInstance`)
  id               uuid primary key default gen_random_uuid(),
  program_id       uuid not null references public.programs(id),
  teacher_id       uuid not null references public.teachers(id),
  day_of_week      smallint not null check (day_of_week between 1 and 7),   -- ISO: 1 = Monday … 7 = Sunday
  start_time       time not null,
  duration_minutes int  not null default 60 check (duration_minutes > 0),
  capacity         int  not null check (capacity > 0),
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index classes_teacher_idx on public.classes (teacher_id);

-- Teacher-set price: internal / payroll only. Never exposed to parents.
create table public.class_rates (
  class_id    uuid primary key references public.classes(id) on delete cascade,
  price_cents int not null check (price_cents >= 0),
  updated_at  timestamptz not null default now()
);

create table public.class_sessions (             -- one dated occurrence of a class
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  session_date  date not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  capacity      int not null check (capacity > 0),
  booked_count  int not null default 0 check (booked_count >= 0),   -- confirmed + pending_payment seats
  status        public.session_status not null default 'scheduled',
  cancel_reason text,
  created_at    timestamptz not null default now(),
  unique (class_id, session_date),
  check (ends_at > starts_at)
);
create index class_sessions_date_idx   on public.class_sessions (session_date) where status = 'scheduled';
create index class_sessions_starts_idx on public.class_sessions (starts_at);

-- ── Payments ──────────────────────────────────────────────────────────────────
create table public.payments (
  id                  uuid primary key,                          -- CLIENT-GENERATED uuid = idempotency key
  family_id           uuid not null references public.families(id) on delete restrict,
  type                public.payment_type not null,
  status              public.payment_status not null default 'pending',
  amount_cents        int not null check (amount_cents >= 0),    -- ex-GST subtotal
  gst_cents           int not null check (gst_cents >= 0),
  total_cents         int generated always as (amount_cents + gst_cents) stored,
  currency            char(3) not null default 'AUD',
  reference           text not null,
  term_label          text,
  child_id            uuid references public.children(id) on delete set null,
  class_session_id    uuid references public.class_sessions(id) on delete set null,
  details             jsonb not null default '{}'::jsonb,        -- display snapshot: subject, day, time, tutor, child_name…
  proof_path          text,                                      -- Storage: payment-proofs/{family_id}/{payment_id}/{file}
  proof_filename      text,
  proof_uploaded_at   timestamptz,
  submitted_by        uuid references public.profiles(id),
  recorded_by_admin   boolean not null default false,
  reviewed_by         uuid references public.profiles(id),
  reviewed_at         timestamptz,
  review_note         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (status <> 'pending' or proof_path is not null)          -- a pending payment always has proof
);
create index payments_family_idx on public.payments (family_id, created_at desc);
create index payments_pending_idx on public.payments (created_at) where status = 'pending';

-- ── Terms & credits ───────────────────────────────────────────────────────────
create table public.terms (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families(id) on delete restrict,
  status            public.term_status not null default 'active',     -- NOT trusted for gating
  term_label        text,
  start_date        date not null,
  end_date          date not null,                                    -- EXCLUSIVE
  classes_included  int not null check (classes_included >= 0),
  classes_booked    int not null default 0,
  classes_remaining int generated always as (classes_included - classes_booked) stored,
  payment_id        uuid unique references public.payments(id),
  created_at        timestamptz not null default now(),
  check (end_date > start_date),
  check (classes_booked between 0 and classes_included),
  exclude using gist (family_id with =, daterange(start_date, end_date, '[)') with &&)
);
create index terms_family_idx on public.terms (family_id, end_date desc);

-- Append-only audit of every credit movement. sum(delta) per term == classes_remaining.
create table public.term_credit_ledger (
  id          bigint generated always as identity primary key,
  term_id     uuid not null references public.terms(id) on delete cascade,
  delta       int not null check (delta <> 0),
  reason      text not null check (reason in ('grant', 'booking', 'cancel_restore', 'admin_adjustment')),
  booking_id  uuid,
  actor_id    uuid references public.profiles(id),
  note        text,
  created_at  timestamptz not null default now()
);
create index term_credit_ledger_term_idx on public.term_credit_ledger (term_id);

create table public.term_reminders_sent (
  term_id uuid primary key references public.terms(id) on delete cascade,
  sent_at timestamptz not null default now()
);

-- ── Bookings ──────────────────────────────────────────────────────────────────
create table public.class_bookings (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null,
  child_id          uuid not null,
  class_session_id  uuid not null references public.class_sessions(id) on delete restrict,
  source            public.booking_source not null,
  status            public.booking_status not null,
  credit_consumed   boolean not null default false,
  term_id           uuid references public.terms(id),
  payment_id        uuid references public.payments(id),
  hold_expires_at   timestamptz,                         -- only while status = 'pending_payment'
  credit_restored   boolean,
  cancelled_at      timestamptz,
  cancelled_by      uuid references public.profiles(id),
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (child_id, family_id) references public.children (id, family_id) on delete cascade,
  check (not credit_consumed or (source = 'term_credit' and term_id is not null))
);
-- A child can have at most ONE live booking (or waitlist entry) per session.
create unique index class_bookings_live_uq on public.class_bookings (child_id, class_session_id)
  where status in ('confirmed', 'pending_payment', 'waiting_list');
create index class_bookings_family_idx  on public.class_bookings (family_id);
create index class_bookings_session_idx on public.class_bookings (class_session_id);
create index class_bookings_hold_idx    on public.class_bookings (hold_expires_at) where status = 'pending_payment';

create table public.individual_class_purchases (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families(id),
  class_booking_id  uuid not null unique references public.class_bookings(id) on delete cascade,
  payment_id        uuid references public.payments(id),
  created_at        timestamptz not null default now()
);

-- ── Assessments, reports, attendance ─────────────────────────────────────────
create table public.assessments (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null,
  child_id        uuid not null,
  teacher_id      uuid references public.teachers(id),
  class_id        uuid references public.classes(id),
  scheduled_date  date,
  scheduled_time  time,
  status          public.assessment_status not null default 'scheduled',
  payment_id      uuid unique references public.payments(id),
  notes           text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (child_id, family_id) references public.children (id, family_id) on delete cascade
);
create index assessments_family_idx  on public.assessments (family_id);
create index assessments_teacher_idx on public.assessments (teacher_id, scheduled_date);

create table public.student_reports (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references public.children(id) on delete cascade,
  teacher_id    uuid not null references public.teachers(id),
  term_label    text not null,
  overall       smallint not null check (overall between 1 and 5),
  subjects      jsonb not null default '[]'::jsonb check (jsonb_typeof(subjects) = 'array'),  -- [{subject, rating 1-5}]
  strengths     text not null,
  areas         text not null default '',
  note          text not null,
  status        public.report_status not null default 'published',
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (child_id, teacher_id, term_label)
);
create index student_reports_child_idx on public.student_reports (child_id);

create table public.attendance (
  id                uuid primary key default gen_random_uuid(),
  class_session_id  uuid not null references public.class_sessions(id) on delete cascade,
  child_id          uuid not null references public.children(id) on delete cascade,
  booking_id        uuid references public.class_bookings(id) on delete set null,
  status            public.attendance_status not null,
  marked_by         uuid references public.profiles(id),
  marked_at         timestamptz not null default now(),
  unique (class_session_id, child_id)
);
create index attendance_child_idx on public.attendance (child_id);

-- ── Messaging ─────────────────────────────────────────────────────────────────
create table public.conversations (
  id                    uuid primary key default gen_random_uuid(),
  kind                  public.conversation_kind not null,
  family_id             uuid references public.families(id) on delete cascade,
  teacher_id            uuid references public.teachers(id) on delete cascade,
  last_message_at       timestamptz,
  last_message_preview  text,
  created_by            uuid references public.profiles(id),
  created_at            timestamptz not null default now(),
  check (
    (kind = 'parent_staff'   and family_id is not null and teacher_id is null) or
    (kind = 'parent_teacher' and family_id is not null and teacher_id is not null) or
    (kind = 'teacher_staff'  and family_id is null     and teacher_id is not null)
  )
);
create unique index conv_parent_staff_uq   on public.conversations (family_id)             where kind = 'parent_staff';
create unique index conv_parent_teacher_uq on public.conversations (family_id, teacher_id) where kind = 'parent_teacher';
create unique index conv_teacher_staff_uq  on public.conversations (teacher_id)            where kind = 'teacher_staff';

create table public.conversation_reads (          -- read state per PARTY (family / teacher / staff)
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  party           public.participant_kind not null,
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, party)
);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid references public.profiles(id) on delete set null,
  sender_role      public.message_sender_role not null,
  sender_name      text not null,
  body             text not null check (char_length(body) between 1 and 4000),
  is_reminder      boolean not null default false,
  created_at       timestamptz not null default now()
);
create index messages_conv_idx on public.messages (conversation_id, created_at desc);

-- ── Notifications & push ──────────────────────────────────────────────────────
create table public.notifications (
  id               uuid primary key default gen_random_uuid(),
  recipient_id     uuid not null references public.profiles(id) on delete cascade,
  family_id        uuid references public.families(id) on delete set null,
  type             public.notification_type not null,
  title            text not null,
  body             text not null,
  action_url       text,                                  -- web route, e.g. '/parent/payments'
  data             jsonb not null default '{}'::jsonb,    -- client-neutral routing data (RN reads this)
  dedupe_key       text,
  read_at          timestamptz,
  push_status      public.push_status not null default 'pending',
  push_attempts    smallint not null default 0,
  push_claimed_at  timestamptz,
  push_sent_at     timestamptz,
  push_error       text,
  created_at       timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx    on public.notifications (recipient_id) where read_at is null;
create index notifications_push_idx      on public.notifications (created_at) where push_status = 'pending';
create unique index notifications_dedupe_uq on public.notifications (recipient_id, dedupe_key) where dedupe_key is not null;

create table public.user_devices (                       -- FCM registration tokens (web + iOS + Android)
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  fcm_token     text not null unique check (char_length(fcm_token) between 20 and 4096),
  platform      public.device_platform not null,
  app_version   text,
  locale        text,
  last_seen_at  timestamptz not null default now(),
  disabled_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index user_devices_profile_idx on public.user_devices (profile_id) where disabled_at is null;

create table public.notification_preferences (
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  category        text not null check (category in
                    ('new_bookings','cancellations','payments','reports','reminders','messages','announcements')),
  push_enabled    boolean not null default true,
  in_app_enabled  boolean not null default true,
  updated_at      timestamptz not null default now(),
  primary key (profile_id, category)
);

-- ── Audit ─────────────────────────────────────────────────────────────────────
create table public.audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  text,
  details    jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','families','teachers','children','classes','payments','class_bookings','assessments','student_reports']
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;
end $$;
```

---

## 5. Migration 0003 — default settings (business rules live here)

```sql
-- 0003_settings.sql
insert into public.app_settings (key, value, description, is_public) values
('pricing', jsonb_build_object(
   'term_base_cents',               50000,
   'registration_fee_cents',         3000,
   'gst_rate',                       0.10,
   'individual_class_cents',         5000,
   'assessment_cents',               5000,
   'registration_fee_every_term',    true),
 'TODO: confirm with client — individual class & assessment price assumed $50; registration fee assumed every term; GST charged on top.', false),

('term_rules', jsonb_build_object(
   'credits',                   10,
   'weeks',                     10,
   'expiry_warning_weeks',       2,
   'cancellation_window_hours', 24,
   'hold_hours',                72),
 'TODO: confirm with client — cancellation window; seat-hold length for unverified individual-class payments.', false),

('business', jsonb_build_object(
   'name',               'Fairybread & Fractions',
   'contact_name',       'Therese Howard',
   'timezone',           'Australia/Sydney',
   'current_term_label', 'Term 4, 2026'),
 'current_term_label is the business-calendar label used on payments/reports. Bank + contact details moved to `public_info` (§13A).', false),

('assessment_booking', jsonb_build_object(
   'slots',        jsonb_build_array('15:30','16:30','17:00'),
   'weekdays',     jsonb_build_array(1,2,3,4,5),
   'lead_days',    2,
   'horizon_days', 42),
 'TODO: confirm with client — which days/slots parents can book assessments.', false),

('session_generation', jsonb_build_object('weeks_ahead', 12), 'How far ahead class_sessions are generated.', false);
-- `public_info` (bank + contact, anon-readable) and `shop` settings are inserted by migration 0012b (§13A).
```

---

## 6. Migration 0004 — helper functions (RLS building blocks)

All helpers are `SECURITY DEFINER` with an **empty `search_path`** (every object is schema-qualified) so they cannot be hijacked and cannot recurse into RLS.

```sql
-- 0004_helpers.sql

create or replace function private.setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.app_settings where key = p_key
$$;

create or replace function private.local_today() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce(private.setting('business')->>'timezone', 'Australia/Sydney'))::date
$$;

create or replace function private.fmt_ts(p_ts timestamptz) returns text
language sql stable security definer set search_path = '' as $$
  select to_char(p_ts at time zone coalesce(private.setting('business')->>'timezone', 'Australia/Sydney'),
                 'FMDy FMDD FMMon, FMHH12:MI AM')
$$;

-- ── Who am I? ─────────────────────────────────────────────────────────────────
create or replace function private.user_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.is_active
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.user_role() = 'admin', false)
$$;

create or replace function private.my_family_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select fm.family_id from public.family_members fm
  where fm.profile_id = (select auth.uid()) limit 1
$$;

create or replace function private.my_teacher_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.teachers t
  where t.profile_id = (select auth.uid()) and t.is_active limit 1
$$;

create or replace function private.is_family_member(p_family uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.family_members fm
                 where fm.family_id = p_family and fm.profile_id = (select auth.uid()))
$$;

-- ── Teacher visibility ────────────────────────────────────────────────────────
create or replace function private.teacher_owns_session(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.class_sessions s join public.classes c on c.id = s.class_id
                 where s.id = p_session and c.teacher_id = private.my_teacher_id())
$$;

create or replace function private.teacher_has_child(p_child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.my_teacher_id() is not null and (
    exists (select 1 from public.class_bookings b
            join public.class_sessions s on s.id = b.class_session_id
            join public.classes c on c.id = s.class_id
            where b.child_id = p_child and b.status = 'confirmed' and c.teacher_id = private.my_teacher_id())
    or exists (select 1 from public.assessments a
               where a.child_id = p_child and a.teacher_id = private.my_teacher_id())
  )
$$;

create or replace function private.teacher_teaches_family(p_teacher uuid, p_family uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.class_bookings b
                 join public.class_sessions s on s.id = b.class_session_id
                 join public.classes c on c.id = s.class_id
                 where b.family_id = p_family and b.status = 'confirmed' and c.teacher_id = p_teacher)
      or exists (select 1 from public.assessments a where a.family_id = p_family and a.teacher_id = p_teacher)
$$;

-- ── Pricing (single source of truth; the client only displays it) ─────────────
create or replace function private.calc_price(
  p_type public.payment_type, p_family uuid, out amount_cents int, out gst_cents int
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_pr jsonb := private.setting('pricing');
  v_amt int;
begin
  if p_type = 'term' then
    v_amt := (v_pr->>'term_base_cents')::int
           + case when (v_pr->>'registration_fee_every_term')::boolean
                    or not exists (select 1 from public.terms where family_id = p_family)
                  then (v_pr->>'registration_fee_cents')::int else 0 end;
  elsif p_type = 'individual_class' then
    v_amt := (v_pr->>'individual_class_cents')::int;
  else
    v_amt := (v_pr->>'assessment_cents')::int;
  end if;
  amount_cents := v_amt;
  gst_cents    := round(v_amt * (v_pr->>'gst_rate')::numeric)::int;
end $$;

-- ── Notification fan-out ──────────────────────────────────────────────────────
create or replace function private.notif_category(p_type public.notification_type) returns text
language sql immutable set search_path = '' as $$
  select case p_type::text
    when 'booking_confirmed'    then 'new_bookings'
    when 'waitlist_spot_open'   then 'new_bookings'
    when 'enrolment_completed'  then 'new_bookings'
    when 'booking_cancelled'    then 'cancellations'
    when 'session_cancelled'    then 'cancellations'
    when 'payment_received'     then 'payments'
    when 'payment_approved'     then 'payments'
    when 'payment_rejected'     then 'payments'
    when 'report_ready'         then 'reports'
    when 'term_expiring'        then 'reminders'
    when 'session_reminder'     then 'reminders'
    when 'assessment_confirmed' then 'reminders'
    when 'message_received'     then 'messages'
    else 'announcements' end
$$;

create or replace function private.notify(
  p_recipient uuid, p_family uuid, p_type public.notification_type,
  p_title text, p_body text, p_action_url text,
  p_data jsonb default '{}'::jsonb, p_dedupe text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_in_app boolean := true;
  v_push   boolean := true;
begin
  select np.in_app_enabled, np.push_enabled into v_in_app, v_push
  from public.notification_preferences np
  where np.profile_id = p_recipient and np.category = private.notif_category(p_type);
  v_in_app := coalesce(v_in_app, true);
  v_push   := coalesce(v_push,   true);
  if not v_in_app then return; end if;

  insert into public.notifications
    (recipient_id, family_id, type, title, body, action_url, data, dedupe_key, push_status)
  values
    (p_recipient, p_family, p_type, p_title, p_body, p_action_url, p_data, p_dedupe,
     case when v_push then 'pending'::public.push_status else 'skipped'::public.push_status end)
  on conflict do nothing;
end $$;

create or replace function private.notify_family(
  p_family uuid, p_type public.notification_type, p_title text, p_body text,
  p_action_url text, p_data jsonb default '{}'::jsonb, p_dedupe text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select profile_id from public.family_members where family_id = p_family loop
    perform private.notify(r.profile_id, p_family, p_type, p_title, p_body, p_action_url, p_data, p_dedupe);
  end loop;
end $$;

create or replace function private.notify_admins(
  p_type public.notification_type, p_title text, p_body text,
  p_action_url text, p_data jsonb default '{}'::jsonb, p_dedupe text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.profiles where role = 'admin' and is_active loop
    perform private.notify(r.id, null, p_type, p_title, p_body, p_action_url, p_data, p_dedupe);
  end loop;
end $$;

create or replace function private.notify_teacher(
  p_teacher uuid, p_type public.notification_type, p_title text, p_body text,
  p_action_url text, p_data jsonb default '{}'::jsonb, p_dedupe text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_profile uuid;
begin
  select profile_id into v_profile from public.teachers where id = p_teacher;
  if v_profile is not null then
    perform private.notify(v_profile, null, p_type, p_title, p_body, p_action_url, p_data, p_dedupe);
  end if;
end $$;

-- Fire the push Edge Function right after commit (pg_net is async). A cron sweeper retries failures.
create or replace function private.dispatch_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  if new.push_status <> 'pending' then return new; end if;
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_function_secret';
  if v_url is null then return new; end if;      -- Vault secrets not created yet: the sweeper will handle it later
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
      body    := jsonb_build_object('notification_id', new.id),
      timeout_milliseconds := 5000);
  exception when others then
    null;                                          -- never block the business transaction because of push
  end;
  return new;
end $$;

create trigger notifications_dispatch_push
  after insert on public.notifications
  for each row execute function private.dispatch_push();

create or replace function private.sweep_pending_push() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_function_secret';
  if v_url is null then return; end if;
  if exists (select 1 from public.notifications
             where push_status = 'pending' and push_attempts < 5 and created_at < now() - interval '1 minute') then
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-webhook-secret', v_secret),
      body := jsonb_build_object('sweep', true), timeout_milliseconds := 5000);
  end if;
end $$;

-- Edge Function claims a notification for sending (prevents double-send when webhook + sweeper overlap).
create or replace function public.claim_notification_push(p_id uuid) returns public.notifications
language plpgsql security definer set search_path = '' as $$
declare v public.notifications;
begin
  update public.notifications
     set push_claimed_at = now(), push_attempts = push_attempts + 1
   where id = p_id and push_status = 'pending' and push_attempts < 5
     and (push_claimed_at is null or push_claimed_at < now() - interval '2 minutes')
  returning * into v;
  return v;                                        -- null row if someone else holds it
end $$;
```

---

## 7. Migration 0005 — auth triggers (profile + family on signup)

```sql
-- 0005_auth_triggers.sql

-- Every new auth user becomes a PARENT with its own family. Role is NEVER read from user metadata
-- (user_metadata is user-editable). Staff accounts are promoted by the admin-invite Edge Function (service role).
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name   text;
  v_phone  text := nullif(btrim(coalesce(new.raw_user_meta_data->>'phone', '')), '');
  v_family uuid;
begin
  v_name := coalesce(
    nullif(btrim(coalesce(new.raw_user_meta_data->>'first_name','') || ' ' || coalesce(new.raw_user_meta_data->>'last_name','')), ''),
    split_part(new.email, '@', 1));

  insert into public.profiles (id, role, full_name, email, phone)
  values (new.id, 'parent', v_name, new.email, v_phone);

  insert into public.families (parent_name, email, phone)
  values (v_name, new.email, v_phone) returning id into v_family;

  insert into public.family_members (family_id, profile_id, relationship, is_primary)
  values (v_family, new.id, 'parent', true);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function private.handle_new_user();

-- On email confirmation: (1) keep profile email in sync; (2) if an admin pre-created a family with this
-- (now VERIFIED) email and it has no login yet, attach the user to it and drop the empty auto-created one.
create or replace function private.handle_user_updated() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_own uuid; v_target uuid;
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;

  if old.email_confirmed_at is null and new.email_confirmed_at is not null
     and (select role from public.profiles where id = new.id) = 'parent' then
    select family_id into v_own from public.family_members where profile_id = new.id;
    select f.id into v_target from public.families f
     where lower(f.email) = lower(new.email)
       and f.id is distinct from v_own
       and not exists (select 1 from public.family_members m where m.family_id = f.id)
     order by f.created_at limit 1;

    if v_target is not null and v_own is not null
       and not exists (select 1 from public.children where family_id = v_own)
       and not exists (select 1 from public.terms    where family_id = v_own)
       and not exists (select 1 from public.payments where family_id = v_own) then
      update public.family_members set family_id = v_target, is_primary = true where profile_id = new.id;
      delete from public.families where id = v_own;
    end if;
  end if;
  return new;
end $$;

create trigger on_auth_user_updated
  after update on auth.users for each row execute function private.handle_user_updated();

-- One round-trip "who am I" used by the frontend AuthProvider (web + React Native).
create or replace function public.get_my_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',         p.id,
    'email',      p.email,
    'full_name',  p.full_name,
    'role',       p.role,
    'family_id',  (select fm.family_id from public.family_members fm where fm.profile_id = p.id limit 1),
    'teacher_id', (select t.id from public.teachers t where t.profile_id = p.id and t.is_active limit 1))
  from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;
```

> **First admin bootstrap.** After the first admin signs up normally, promote them once in the SQL editor:
> `update public.profiles set role = 'admin' where email = 'owner@yourdomain.au';`
> Everyone else is invited through the `admin-invite-user` Edge Function (see `BACKEND_IMPLEMENTATION.md` §7).


---

## 8. Migration 0006 — business RPCs (credits, bookings, payments, enrolment)

> **Locking order (prevents deadlocks):** `class_sessions` → `terms` → `class_bookings` → `payments`. Every function below follows it.
> **Error contract:** functions raise `exception '<code>'` with a stable snake_case code. The frontend maps codes to friendly copy (`BACKEND_IMPLEMENTATION.md` §3.4).
> **Codes used:** `not_authenticated forbidden child_not_found child_not_enrolled session_unavailable session_started session_outside_term no_term_ever term_expired no_credits class_full already_booked booking_not_found already_cancelled payment_not_found payment_not_pending invalid_action proof_missing invalid_input consent_required signature_required seat_unavailable class_has_bookings conversation_not_found invalid_message`.

```sql
-- 0006_rpc_business.sql

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

-- Authoritative gating state (the UI keeps termUtils.ts for instant display; the server re-checks on every booking).
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

  -- 1) session first (lock order)
  select * into v_session from public.class_sessions where id = p_session_id for update;
  if not found or v_session.status <> 'scheduled' then raise exception 'session_unavailable'; end if;
  if v_session.starts_at <= now() then raise exception 'session_started'; end if;

  -- 2) the term whose 10-week window is running today
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

  -- 3) booking row (re-use a waitlist row if present)
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

-- ── Cancellation (24-hour rule enforced here) ─────────────────────────────────
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
  select * into v_b from public.class_bookings where id = p_booking_id;                  -- unlocked peek
  if not found then raise exception 'booking_not_found'; end if;
  if not (v_admin or private.is_family_member(v_b.family_id)) then raise exception 'forbidden' using errcode = '42501'; end if;

  select * into v_s from public.class_sessions where id = v_b.class_session_id for update;          -- 1) session
  if v_b.term_id is not null then perform 1 from public.terms where id = v_b.term_id for update; end if; -- 2) term
  select * into v_b from public.class_bookings where id = p_booking_id for update;                  -- 3) booking
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
-- Validates + reserves a seat for an individual-class payment (used by submit_payment and admin_record_payment).
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

-- Parent submits a payment with proof. p_id is generated by the client (uuid v4) and is the idempotency key.
-- Upload the file FIRST to payment-proofs/{family_id}/{p_id}/{filename}, then call this.
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

  select * into v_pay from public.payments where id = p_id;                       -- idempotent retry
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

-- Applies the side-effects of a PAID payment (term activation / seat confirmation / assessment confirmation).
create or replace function private.apply_paid_payment(p_payment_id uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments; v_rules jsonb := private.setting('term_rules'); v_today date := private.local_today();
  v_start date; v_end date; v_term uuid; v_sid uuid; v_b public.class_bookings; v_s public.class_sessions;
  v_child text; v_a public.assessments;
begin
  select * into p from public.payments where id = p_payment_id;

  if p.type = 'term' then
    -- early renewal: new term starts when the latest running/scheduled term ends; credits never roll over
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
      select * into v_s from public.class_sessions where id = v_sid for update;                  -- 1) session
      select * into v_b from public.class_bookings where payment_id = p.id for update;            -- 3) booking
      if v_b.status = 'cancelled' then                                                           -- hold had lapsed
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

-- Admin books/charges on behalf of a family (counter / cash / bank transfer already confirmed). Immediately paid.
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

-- Goodwill / correction. Changes classes_included; never below classes_booked.
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

-- ── Session / class management ───────────────────────────────────────────────
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

-- ── Attendance ───────────────────────────────────────────────────────────────
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

-- Admin books on behalf of a family that never filled in the online enrolment form (paper form / phone).
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

-- ── Families (admin) ─────────────────────────────────────────────────────────
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
```

---

## 9. Migration 0007 — messaging, notifications, devices, dashboard RPCs and triggers

```sql
-- 0007_rpc_comms.sql

-- ── Conversations ────────────────────────────────────────────────────────────
create or replace function private.ensure_conversation(
  p_kind public.conversation_kind, p_family uuid, p_teacher uuid, p_actor uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select c.id into v_id from public.conversations c
   where c.kind = p_kind and c.family_id is not distinct from p_family and c.teacher_id is not distinct from p_teacher;
  if v_id is not null then return v_id; end if;
  begin
    insert into public.conversations (kind, family_id, teacher_id, created_by) values (p_kind, p_family, p_teacher, p_actor) returning id into v_id;
  exception when unique_violation then
    select c.id into v_id from public.conversations c
     where c.kind = p_kind and c.family_id is not distinct from p_family and c.teacher_id is not distinct from p_teacher;
  end;
  return v_id;
end $$;

create or replace function public.start_conversation(p_kind public.conversation_kind, p_family_id uuid default null, p_teacher_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_admin boolean := private.is_admin();
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_kind = 'parent_staff' then
    if p_family_id is null or not (v_admin or private.is_family_member(p_family_id)) then raise exception 'forbidden' using errcode = '42501'; end if;
    return private.ensure_conversation(p_kind, p_family_id, null, v_uid);
  elsif p_kind = 'parent_teacher' then
    if p_family_id is null or p_teacher_id is null then raise exception 'invalid_input'; end if;
    -- a parent may message a teacher who teaches their child; a teacher may message a family they teach
    if not ((private.is_family_member(p_family_id) or p_teacher_id = private.my_teacher_id())
            and private.teacher_teaches_family(p_teacher_id, p_family_id)) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    return private.ensure_conversation(p_kind, p_family_id, p_teacher_id, v_uid);
  else
    if p_teacher_id is null or not (v_admin or p_teacher_id = private.my_teacher_id()) then raise exception 'forbidden' using errcode = '42501'; end if;
    return private.ensure_conversation(p_kind, null, p_teacher_id, v_uid);
  end if;
end $$;

create or replace function public.send_message(p_conversation_id uuid, p_body text, p_is_reminder boolean default false)
returns public.messages language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid()); v_c public.conversations; v_msg public.messages;
  v_party public.participant_kind; v_role public.message_sender_role; v_name text; v_body text := btrim(coalesce(p_body, ''));
  v_biz text := coalesce(private.setting('business')->>'name', 'Fairybread & Fractions');
begin
  select * into v_c from public.conversations where id = p_conversation_id;
  if not found then raise exception 'conversation_not_found'; end if;
  if char_length(v_body) not between 1 and 4000 then raise exception 'invalid_message'; end if;

  if private.is_admin() and v_c.kind in ('parent_staff', 'teacher_staff') then
    v_party := 'staff';   v_role := 'admin';   v_name := case when v_c.kind = 'parent_staff' then v_biz else 'Admin' end;
  elsif v_c.teacher_id is not null and v_c.teacher_id = private.my_teacher_id() then
    v_party := 'teacher'; v_role := 'teacher'; select name into v_name from public.teachers where id = v_c.teacher_id;
  elsif v_c.family_id is not null and private.is_family_member(v_c.family_id) then
    v_party := 'family';  v_role := 'parent';  select full_name into v_name from public.profiles where id = v_uid;
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.messages (conversation_id, sender_id, sender_role, sender_name, body, is_reminder)
  values (p_conversation_id, v_uid, v_role, coalesce(nullif(v_name, ''), 'Member'), v_body, coalesce(p_is_reminder, false))
  returning * into v_msg;

  update public.conversations set last_message_at = v_msg.created_at, last_message_preview = left(v_body, 140) where id = p_conversation_id;
  insert into public.conversation_reads (conversation_id, party, last_read_at) values (p_conversation_id, v_party, now())
  on conflict (conversation_id, party) do update set last_read_at = excluded.last_read_at;

  -- notify the other side
  if v_party = 'family' then
    if v_c.kind = 'parent_staff' then
      perform private.notify_admins('message_received', 'New message from ' || v_msg.sender_name, left(v_body, 100), '/admin/messages', jsonb_build_object('conversation_id', v_c.id));
    else
      perform private.notify_teacher(v_c.teacher_id, 'message_received', 'New message from ' || v_msg.sender_name, left(v_body, 100), '/teacher/messages', jsonb_build_object('conversation_id', v_c.id));
    end if;
  elsif v_party = 'teacher' then
    if v_c.kind = 'parent_teacher' then
      perform private.notify_family(v_c.family_id, 'message_received', 'New message from ' || v_msg.sender_name, left(v_body, 100), '/parent/messages', jsonb_build_object('conversation_id', v_c.id));
    else
      perform private.notify_admins('message_received', 'New message from ' || v_msg.sender_name, left(v_body, 100), '/admin/messages', jsonb_build_object('conversation_id', v_c.id));
    end if;
  else
    if v_c.kind = 'parent_staff' then
      perform private.notify_family(v_c.family_id, 'message_received', 'New message from ' || v_biz, left(v_body, 100), '/parent/messages', jsonb_build_object('conversation_id', v_c.id));
    else
      perform private.notify_teacher(v_c.teacher_id, 'message_received', 'New message from Admin', left(v_body, 100), '/teacher/messages', jsonb_build_object('conversation_id', v_c.id));
    end if;
  end if;
  return v_msg;
end $$;

-- Inbox with unread counts, computed for the caller's side of each conversation.
create or replace function public.get_conversations()
returns table (id uuid, kind public.conversation_kind, family_id uuid, teacher_id uuid, family_name text, teacher_name text,
               last_message_preview text, last_message_at timestamptz, unread_count bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, c.kind, c.family_id, c.teacher_id, f.parent_name, t.name, c.last_message_preview, c.last_message_at,
         case when me.party is null then 0::bigint else (
           select count(*) from public.messages m
            where m.conversation_id = c.id
              and m.created_at > coalesce((select cr.last_read_at from public.conversation_reads cr
                                            where cr.conversation_id = c.id and cr.party = me.party), '-infinity'::timestamptz)
              and m.sender_role <> me.sender) end
  from public.conversations c
  left join public.families f on f.id = c.family_id
  left join public.teachers t on t.id = c.teacher_id
  cross join lateral (select
      case when private.is_admin() and c.kind in ('parent_staff','teacher_staff') then 'staff'::public.participant_kind
           when private.my_family_id() is not null and c.family_id = private.my_family_id() then 'family'::public.participant_kind
           when private.my_teacher_id() is not null and c.teacher_id = private.my_teacher_id() then 'teacher'::public.participant_kind end as party,
      case when private.is_admin() and c.kind in ('parent_staff','teacher_staff') then 'admin'::public.message_sender_role
           when private.my_family_id() is not null and c.family_id = private.my_family_id() then 'parent'::public.message_sender_role
           when private.my_teacher_id() is not null and c.teacher_id = private.my_teacher_id() then 'teacher'::public.message_sender_role end as sender) me
  where private.is_admin()
     or (private.my_family_id()  is not null and c.family_id  = private.my_family_id())
     or (private.my_teacher_id() is not null and c.teacher_id = private.my_teacher_id())
  order by c.last_message_at desc nulls last
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_c public.conversations; v_party public.participant_kind;
begin
  select * into v_c from public.conversations where id = p_conversation_id;
  if not found then raise exception 'conversation_not_found'; end if;
  if private.is_admin() and v_c.kind in ('parent_staff','teacher_staff') then v_party := 'staff';
  elsif v_c.teacher_id is not null and v_c.teacher_id = private.my_teacher_id() then v_party := 'teacher';
  elsif v_c.family_id is not null and private.is_family_member(v_c.family_id) then v_party := 'family';
  else return; end if;
  insert into public.conversation_reads (conversation_id, party, last_read_at) values (p_conversation_id, v_party, now())
  on conflict (conversation_id, party) do update set last_read_at = now();
end $$;

-- ── Notifications / devices ──────────────────────────────────────────────────
create or replace function public.mark_all_notifications_read() returns int
language sql security definer set search_path = '' as $$
  with u as (update public.notifications set read_at = now()
              where recipient_id = (select auth.uid()) and read_at is null returning 1)
  select count(*)::int from u
$$;

-- Token ownership moves to whoever logs in on the device (shared tablets, logout/login as someone else).
create or replace function public.register_device(p_token text, p_platform public.device_platform,
                                                  p_app_version text default null, p_locale text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.user_devices (profile_id, fcm_token, platform, app_version, locale)
  values ((select auth.uid()), p_token, p_platform, p_app_version, p_locale)
  on conflict (fcm_token) do update
     set profile_id = excluded.profile_id, platform = excluded.platform, app_version = excluded.app_version,
         locale = excluded.locale, last_seen_at = now(), disabled_at = null;
end $$;

create or replace function public.unregister_device(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.user_devices where fcm_token = p_token and profile_id = (select auth.uid())
$$;

-- ── Admin dashboard ──────────────────────────────────────────────────────────
create or replace function public.admin_dashboard_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := private.local_today(); v_label text := private.setting('business')->>'current_term_label';
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'active_students', (select count(distinct c.id) from public.children c
                         join public.terms t on t.family_id = c.family_id and t.start_date <= v_today and t.end_date > v_today
                        where c.enrolled_at is not null and c.archived_at is null),
    'upcoming_assessments', (select count(*) from public.assessments where status = 'scheduled' and scheduled_date >= v_today),
    'classes_today',        (select count(*) from public.class_sessions where session_date = v_today and status = 'scheduled'),
    'pending_payments',     (select count(*) from public.payments where status = 'pending'),
    'reports_due',          (select count(distinct b.child_id) from public.class_bookings b
                              join public.class_sessions s on s.id = b.class_session_id
                             where b.status = 'confirmed' and s.session_date >= v_today - 70
                               and not exists (select 1 from public.student_reports r
                                                where r.child_id = b.child_id and r.term_label = v_label and r.status = 'published')),
    'revenue_this_month_cents', (select coalesce(sum(total_cents), 0) from public.payments
                                  where status = 'paid' and date_trunc('month', created_at) = date_trunc('month', now())),
    'weekly_attendance', (select coalesce(jsonb_agg(jsonb_build_object('week', w.wk, 'rate', w.rate) order by w.wk), '[]'::jsonb)
                            from (select date_trunc('week', s.session_date)::date as wk,
                                         round(100.0 * count(*) filter (where a.status in ('present','late')) / nullif(count(*), 0)) as rate
                                    from public.attendance a join public.class_sessions s on s.id = a.class_session_id
                                   where s.session_date >= v_today - 84 group by 1) w)
  );
end $$;

-- ── Triggers ─────────────────────────────────────────────────────────────────
-- Publishing a report notifies the family once.
create or replace function private.on_report_published() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_family uuid; v_child text; v_teacher text;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
    select family_id, given_name into v_family, v_child from public.children where id = new.child_id;
    select name into v_teacher from public.teachers where id = new.teacher_id;
    perform private.notify_family(v_family, 'report_ready', 'New report available',
      format('%s''s progress report from %s is ready to view.', v_child, v_teacher),
      '/parent/reports', jsonb_build_object('report_id', new.id, 'child_id', new.child_id), 'report:' || new.id);
  end if;
  return new;
end $$;
create trigger student_reports_published before insert or update on public.student_reports
  for each row execute function private.on_report_published();

-- Changing a class's slot/capacity regenerates FUTURE sessions that have no bookings.
create or replace function private.on_class_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.day_of_week, new.start_time, new.duration_minutes, new.capacity, new.is_active)
     is distinct from (old.day_of_week, old.start_time, old.duration_minutes, old.capacity, old.is_active) then
    delete from public.class_sessions
     where class_id = new.id and session_date >= private.local_today() and booked_count = 0 and status = 'scheduled'
       and not exists (select 1 from public.class_bookings b where b.class_session_id = class_sessions.id and b.status = 'waiting_list');
    update public.class_sessions set capacity = new.capacity
     where class_id = new.id and session_date >= private.local_today() and status = 'scheduled';
    if new.is_active then perform private.generate_class_sessions(); end if;
  end if;
  return new;
end $$;
```

```sql
create trigger classes_after_update after update on public.classes
  for each row execute function private.on_class_changed();

-- A brand-new class gets its sessions generated immediately.
create or replace function private.on_class_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_active then perform private.generate_class_sessions(); end if;
  return new;
end $$;
create trigger classes_after_insert after insert on public.classes
  for each row execute function private.on_class_created();
```

> Both triggers call `private.generate_class_sessions()`, created in §13 (plpgsql resolves it at run time, so the order is safe).

---

## 10. Migration 0008 — Row Level Security

Every table has RLS **enabled**. No policy = no access. Writes to business tables are **not** granted at all (they go through RPCs), so even an admin cannot bypass invariants from the browser.

```sql
-- 0008_rls.sql
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','families','family_members','teachers','programs','children','enrolments','app_settings','documents','closures',
    'classes','class_rates','class_sessions','payments','terms','term_credit_ledger','term_reminders_sent','class_bookings',
    'individual_class_purchases','assessments','student_reports','attendance','conversations','conversation_reads','messages',
    'notifications','user_devices','notification_preferences','audit_log']
  loop execute format('alter table public.%I enable row level security', t); end loop;
end $$;

-- ── Identity ──────────────────────────────────────────────────────────────────
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));   -- columns limited by GRANT (no role / is_active)

create policy families_select on public.families for select to authenticated
  using (id = (select private.my_family_id()) or (select private.is_admin()));
create policy families_update on public.families for update to authenticated
  using (id = (select private.my_family_id()) or (select private.is_admin()))
  with check (id = (select private.my_family_id()) or (select private.is_admin()));
create policy families_insert_admin on public.families for insert to authenticated
  with check ((select private.is_admin()));

create policy family_members_select on public.family_members for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.is_admin()));

create policy teachers_select on public.teachers for select to authenticated using (true);
create policy teachers_admin_write on public.teachers for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy programs_select on public.programs for select to authenticated using (true);
create policy programs_admin_write on public.programs for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ── Children / enrolment ─────────────────────────────────────────────────────
create policy children_select on public.children for select to authenticated using (
  family_id = (select private.my_family_id()) or (select private.is_admin()) or private.teacher_has_child(id));
create policy children_insert on public.children for insert to authenticated
  with check (family_id = (select private.my_family_id()) or (select private.is_admin()));
create policy children_update on public.children for update to authenticated
  using (family_id = (select private.my_family_id()) or (select private.is_admin()))
  with check (family_id = (select private.my_family_id()) or (select private.is_admin()));

create policy enrolments_select on public.enrolments for select to authenticated
  using (family_id = (select private.my_family_id()) or (select private.is_admin()));

-- ── Settings / content ───────────────────────────────────────────────────────
create policy settings_select_anon on public.app_settings for select to anon using (is_public);
create policy settings_select_auth on public.app_settings for select to authenticated using (true);
create policy settings_admin_write on public.app_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy documents_select on public.documents for select to anon, authenticated using (true);
create policy documents_admin_write on public.documents for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy closures_select on public.closures for select to authenticated using (true);
create policy closures_admin_write on public.closures for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ── Classes ───────────────────────────────────────────────────────────────────
create policy classes_select on public.classes for select to authenticated
  using (is_active or (select private.is_admin()) or teacher_id = (select private.my_teacher_id()));
create policy classes_insert on public.classes for insert to authenticated
  with check ((select private.is_admin()) or teacher_id = (select private.my_teacher_id()));
create policy classes_update on public.classes for update to authenticated
  using ((select private.is_admin()) or teacher_id = (select private.my_teacher_id()))
  with check ((select private.is_admin()) or teacher_id = (select private.my_teacher_id()));

create policy class_rates_all on public.class_rates for all to authenticated
  using ((select private.is_admin()) or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select private.my_teacher_id())))
  with check ((select private.is_admin()) or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select private.my_teacher_id())));

create policy class_sessions_select on public.class_sessions for select to authenticated using (true);

-- ── Money & credits (read-only from the client) ──────────────────────────────
create policy payments_select on public.payments for select to authenticated
  using (family_id = (select private.my_family_id()) or (select private.is_admin()));
create policy terms_select on public.terms for select to authenticated
  using (family_id = (select private.my_family_id()) or (select private.is_admin()));
create policy ledger_select on public.term_credit_ledger for select to authenticated
  using ((select private.is_admin()) or exists (select 1 from public.terms t where t.id = term_id and t.family_id = (select private.my_family_id())));
create policy purchases_select on public.individual_class_purchases for select to authenticated
  using (family_id = (select private.my_family_id()) or (select private.is_admin()));

create policy bookings_select on public.class_bookings for select to authenticated using (
  family_id = (select private.my_family_id()) or (select private.is_admin()) or private.teacher_owns_session(class_session_id));

-- ── Assessments / reports / attendance ───────────────────────────────────────
create policy assessments_select on public.assessments for select to authenticated using (
  family_id = (select private.my_family_id()) or (select private.is_admin()) or teacher_id = (select private.my_teacher_id()));
create policy assessments_insert on public.assessments for insert to authenticated with check (
  (select private.is_admin()) or (teacher_id = (select private.my_teacher_id()) and private.teacher_has_child(child_id)));
create policy assessments_update on public.assessments for update to authenticated
  using ((select private.is_admin()) or teacher_id = (select private.my_teacher_id()))
  with check ((select private.is_admin()) or teacher_id = (select private.my_teacher_id()));

create policy reports_select on public.student_reports for select to authenticated using (
  (select private.is_admin()) or teacher_id = (select private.my_teacher_id())
  or (status = 'published' and child_id in (select c.id from public.children c where c.family_id = (select private.my_family_id()))));
create policy reports_insert on public.student_reports for insert to authenticated with check (
  (select private.is_admin()) or (teacher_id = (select private.my_teacher_id()) and private.teacher_has_child(child_id)));
create policy reports_update on public.student_reports for update to authenticated
  using ((select private.is_admin()) or teacher_id = (select private.my_teacher_id()))
  with check ((select private.is_admin()) or (teacher_id = (select private.my_teacher_id()) and private.teacher_has_child(child_id)));

create policy attendance_select on public.attendance for select to authenticated using (
  (select private.is_admin()) or private.teacher_owns_session(class_session_id)
  or child_id in (select c.id from public.children c where c.family_id = (select private.my_family_id())));

-- ── Messaging ─────────────────────────────────────────────────────────────────
create policy conversations_select on public.conversations for select to authenticated using (
  (select private.is_admin())
  or (family_id  is not null and family_id  = (select private.my_family_id()))
  or (teacher_id is not null and teacher_id = (select private.my_teacher_id())));
create policy messages_select on public.messages for select to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id));   -- inherits conversation RLS

-- ── Notifications / devices / prefs ──────────────────────────────────────────
create policy notifications_select on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));   -- only read_at is granted
create policy devices_select on public.user_devices for select to authenticated using (profile_id = (select auth.uid()));
create policy devices_delete on public.user_devices for delete to authenticated using (profile_id = (select auth.uid()));
create policy prefs_all on public.notification_preferences for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create policy audit_select on public.audit_log for select to authenticated using ((select private.is_admin()));
```

---

## 11. Migration 0009 — privileges (deny by default, then grant exactly what is needed)

```sql
-- 0009_grants.sql

-- 1) Start from nothing.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public  from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon;

-- 2) Table reads (RLS filters rows).
grant select on public.profiles, public.families, public.family_members, public.teachers, public.programs,
  public.children, public.enrolments, public.app_settings, public.documents, public.closures,
  public.classes, public.class_rates, public.class_sessions, public.payments, public.terms, public.term_credit_ledger,
  public.class_bookings, public.individual_class_purchases, public.assessments, public.student_reports, public.attendance,
  public.conversations, public.messages, public.notifications, public.user_devices, public.notification_preferences,
  public.audit_log
  to authenticated;
grant select on public.app_settings, public.documents to anon;   -- RLS limits anon to is_public settings

-- 3) Column-restricted writes (RLS decides which ROWS; these decide which COLUMNS).
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;                 -- never role / is_active
grant update (parent_name, phone, secondary_phone, address, relationship, emergency_name,
              emergency_relationship, emergency_phone, referral_source) on public.families to authenticated;
grant insert (parent_name, email, phone) on public.families to authenticated;                    -- admin only via policy
grant insert (family_id, given_name, family_name, preferred_name, year_level, school, date_of_birth, concern, subjects,
              preferred_days, goals, notes, preferred_teacher_id, sessions_per_week) on public.children to authenticated;
grant update (given_name, family_name, preferred_name, year_level, school, date_of_birth, concern, subjects,
              preferred_days, goals, notes, preferred_teacher_id, sessions_per_week, archived_at) on public.children to authenticated;
                                                                                                  -- never enrolled_at / family_id
grant insert, update on public.teachers, public.programs, public.closures to authenticated;       -- admin via policy
grant delete on public.closures to authenticated;
grant insert (key, storage_path, version, original_filename, updated_by, updated_at), update on public.documents to authenticated;
grant update (value, updated_by, updated_at) on public.app_settings to authenticated;             -- admin via policy

grant insert (program_id, teacher_id, day_of_week, start_time, duration_minutes, capacity, is_active, created_by) on public.classes to authenticated;
grant update (program_id, teacher_id, day_of_week, start_time, duration_minutes, capacity, is_active) on public.classes to authenticated;
grant insert, update on public.class_rates to authenticated;                                      -- NO delete on classes: use deactivate_class()

grant insert (family_id, child_id, teacher_id, class_id, scheduled_date, scheduled_time, status, notes, created_by) on public.assessments to authenticated;
grant update (teacher_id, scheduled_date, scheduled_time, status, notes) on public.assessments to authenticated;

grant insert (child_id, teacher_id, term_label, overall, subjects, strengths, areas, note, status) on public.student_reports to authenticated;
grant update (overall, subjects, strengths, areas, note, status) on public.student_reports to authenticated;

grant update (read_at) on public.notifications to authenticated;
grant delete on public.user_devices to authenticated;
grant insert, update on public.notification_preferences to authenticated;
-- Intentionally NO write grants on: payments, terms, term_credit_ledger, class_bookings, class_sessions, individual_class_purchases,
-- attendance, conversations, messages, enrolments, family_members, audit_log  → RPC only.

-- 4) RPCs callable by signed-in users (each re-checks identity/role inside).
grant execute on function
  public.get_my_context(), public.quote_price(public.payment_type, uuid), public.get_family_gating(uuid),
  public.complete_enrolment(uuid, jsonb, jsonb, text, text, boolean, boolean, boolean),
  public.book_class_session(uuid, uuid), public.join_waitlist(uuid, uuid), public.cancel_booking(uuid, boolean),
  public.submit_payment(uuid, uuid, public.payment_type, text, text, uuid, uuid, date, time),
  public.verify_payment(uuid, text, text), public.admin_record_payment(uuid, public.payment_type, uuid, uuid, text),
  public.admin_adjust_credits(uuid, int, text), public.cancel_session(uuid, text), public.deactivate_class(uuid, boolean),
  public.save_attendance(uuid, jsonb), public.admin_create_family(text, text, text), public.admin_mark_enrolled(uuid, text),
  public.start_conversation(public.conversation_kind, uuid, uuid), public.send_message(uuid, text, boolean),
  public.get_conversations(), public.mark_conversation_read(uuid), public.mark_all_notifications_read(),
  public.register_device(text, public.device_platform, text, text), public.unregister_device(text),
  public.admin_dashboard_stats()
  to authenticated;

-- 5) Helpers used inside RLS policies / invoker views must be executable by the caller (they live in the unexposed `private` schema).
grant execute on function
  private.is_admin(), private.user_role(), private.my_family_id(), private.my_teacher_id(), private.is_family_member(uuid),
  private.teacher_owns_session(uuid), private.teacher_has_child(uuid), private.teacher_teaches_family(uuid, uuid),
  private.local_today()
  to authenticated;

-- 6) Edge Function (service role) only.
grant execute on function public.claim_notification_push(uuid) to service_role;
```

---

## 12. Migration 0010 — views, storage, realtime

```sql
-- 0010_views_storage_realtime.sql

-- ── Views (security_invoker => the caller's RLS applies) ─────────────────────
create view public.v_class_catalog with (security_invoker = true) as
select c.id, c.program_id, pr.name as subject, pr.color as program_color,
       c.teacher_id, t.name as teacher_name, t.initials as teacher_initials, t.color as teacher_color,
       c.day_of_week, c.start_time, c.duration_minutes, c.capacity, c.is_active,
       ns.id as next_session_id, ns.starts_at as next_session_at, coalesce(ns.booked_count, 0) as next_booked_count
from public.classes c
join public.programs pr on pr.id = c.program_id
join public.teachers t  on t.id  = c.teacher_id
left join lateral (select s.id, s.starts_at, s.booked_count from public.class_sessions s
                    where s.class_id = c.id and s.status = 'scheduled' and s.starts_at > now()
                    order by s.starts_at limit 1) ns on true;

create view public.v_family_summary with (security_invoker = true) as
select f.id as family_id, f.reference_code, f.parent_name, f.email, f.phone,
  exists (select 1 from public.family_members m where m.family_id = f.id) as has_portal_access,
  (select count(*) from public.children c where c.family_id = f.id and c.archived_at is null) as child_count,
  case when not exists (select 1 from public.terms t where t.family_id = f.id) then 'NO_TERM_EVER'
       when exists (select 1 from public.terms t where t.family_id = f.id and t.end_date > private.local_today()) then 'ACTIVE_TERM'
       else 'TERM_EXPIRED' end as gating_state,
  (select t.classes_remaining from public.terms t where t.family_id = f.id and t.start_date <= private.local_today()
     and t.end_date > private.local_today() order by t.start_date desc limit 1) as credits_remaining,
  (select t.end_date from public.terms t where t.family_id = f.id and t.start_date <= private.local_today()
     and t.end_date > private.local_today() order by t.start_date desc limit 1) as term_end_date,
  (select p.status from public.payments p where p.family_id = f.id order by p.created_at desc limit 1) as last_payment_status
from public.families f;

create view public.v_program_stats with (security_invoker = true) as
select pr.id, pr.name, pr.description, pr.color, pr.is_active,
  (select count(distinct b.child_id) from public.class_bookings b
     join public.class_sessions s on s.id = b.class_session_id join public.classes c on c.id = s.class_id
    where c.program_id = pr.id and b.status = 'confirmed' and s.session_date >= private.local_today() - 70) as students
from public.programs pr;

grant select on public.v_class_catalog, public.v_family_summary, public.v_program_stats to authenticated;

-- Monitoring only (run in SQL editor / service role — NOT granted to clients). Should always return 0 rows.
create view public.v_counter_drift as
select 'session_booked_count' as kind, s.id::text as id, s.booked_count as stored, count(b.id)::int as actual
  from public.class_sessions s
  left join public.class_bookings b on b.class_session_id = s.id and b.status in ('confirmed', 'pending_payment')
 group by s.id having s.booked_count <> count(b.id)
union all
select 'term_classes_booked', t.id::text, t.classes_booked,
       (select count(*)::int from public.class_bookings b where b.term_id = t.id and b.credit_consumed and b.status = 'confirmed')
  from public.terms t
 where t.classes_booked <> (select count(*) from public.class_bookings b where b.term_id = t.id and b.credit_consumed and b.status = 'confirmed')
union all
select 'term_ledger_sum', t.id::text, t.classes_remaining, coalesce((select sum(l.delta)::int from public.term_credit_ledger l where l.term_id = t.id), 0)
  from public.terms t
 where t.classes_remaining <> coalesce((select sum(l.delta) from public.term_credit_ledger l where l.term_id = t.id), 0);

-- ── Storage ──────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('payment-proofs', 'payment-proofs', false, 10485760,
     array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  ('documents',      'documents',      true,  10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- payment-proofs: path = {family_id}/{payment_id}/{filename}. Evidence is immutable: no update/delete from clients.
create policy proofs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = (select private.my_family_id())::text);
create policy proofs_select on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs'
         and ((storage.foldername(name))[1] = (select private.my_family_id())::text or (select private.is_admin())));

-- documents: public read via public URL; only admins write.
create policy documents_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (select private.is_admin()));
create policy documents_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (select private.is_admin()));
create policy documents_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (select private.is_admin()));

-- ── Realtime (respects RLS) ──────────────────────────────────────────────────
alter publication supabase_realtime add table public.messages, public.notifications;
```

---

## 13. Migration 0011 — scheduled jobs (pg_cron)

```sql
-- 0011_cron.sql

-- Rolling window of dated sessions for every active class (skips closures).
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

-- Daily: warn families whose term ends within TERM_EXPIRY_WARNING_WEEKS (notification + system message, once per term).
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
              and not exists (select 1 from public.terms n where n.family_id = t.family_id and n.start_date >= t.end_date)  -- already renewed
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

-- Hourly: remind families about classes starting within 24h (idempotent via dedupe_key).
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

-- Every 15 min: release seats held for individual-class payments that were never verified.
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
```

### 13.1 Vault secrets for the push trigger (run once per environment, **not** in a migration)

```sql
select vault.create_secret('https://<PROJECT_REF>.supabase.co/functions/v1/send-push', 'push_function_url');
select vault.create_secret('<long-random-string>',                                      'push_function_secret');
-- The same random string must be set as the Edge Function secret PUSH_WEBHOOK_SECRET.
```

---

## 13A. Migration 0012 — Learning Shop (products, portal orders, **guest** orders)

> **What this adds** (from `SHOP_AND_AUTH_UPDATES.md`): `ShopProduct`, `ShopOrder`, portal checkout, public guest checkout at `/shop`, COD vs advance bank transfer with receipt upload, admin payment verification, order statuses, receipt printing.
> **Apply as two files.** `0012a_shop_enums.sql` (only the `alter type … add value` statements — a new enum value cannot be *used* in the same transaction that adds it) and `0012b_shop.sql` (everything else).
> **Codes added to the error contract:** `out_of_stock product_unavailable payment_method_disabled guest_checkout_disabled rate_limited order_not_found invalid_transition payment_required`.

### Design notes specific to the shop

| # | Decision | Why |
|---|---|---|
| S1 | **The server prices every order.** The client sends only `{product_id, quantity}`; unit prices, totals, shipping and stock are read inside the transaction. | The mock trusted `price` and `total` from the browser. |
| S2 | **Stock is a number, status is derived** (`Out of Stock` ≤ 0, `Low Stock` ≤ threshold, else `In Stock`). Stock is decremented when the order is placed and returned if the order is cancelled. | Prevents overselling; the UI's three-state badge keeps working. |
| S3 | **Guests never touch tables.** Anonymous visitors have **no** grants on shop tables. Guest checkout goes through the `shop-guest-checkout` Edge Function (service role), with IP-hash rate limits, optional Turnstile CAPTCHA and signed one-shot receipt-upload URLs. | `/shop` is public; direct anon inserts would be a spam/abuse hole. |
| S4 | **Products reach the public only through `get_shop_products()`**, which returns the derived *status*, never the stock count. | Competitors/scrapers should not see inventory levels. |
| S5 | **Order identity:** `id` is a client-generated UUID (idempotency key, also the receipt folder name); `order_number` (`FBO-1001`…) is the human reference shown in the UI/receipts/emails. | Same pattern as `payments`. |
| S6 | **Portal orders derive the family from the JWT**; the old `placeOrder(familyId, familyName, …)` arguments are ignored server-side. | A parent must not be able to order "as" another family. |
| S7 | **Status machine** `Pending → Processing → Shipped → Delivered`, plus `Cancelled`. Advance orders can't enter *Processing* until payment is verified. COD becomes `paid` on *Delivered*. Cancelling returns stock. | The UI shows four statuses but had no way to progress them. |
| S8 | **Rejected advance orders** stay `Pending/unpaid` (matches the mock) and are auto-cancelled after `shop.advance_hold_days` (default 3) so stock isn't held forever. | Reliability. |
| S9 | **Bank details and contact details move to a public setting `public_info`** (guests need them at checkout step 4). They no longer live in `business`. | One source of truth, readable by anon. |
| S10 | **New notification category `orders`** (admin: new order; parent: payment verified/rejected, shipped, delivered). | Honors per-user push/in-app preferences. |
| S11 | `// TODO: confirm with client` — GST/shipping on shop items (currently **price = final price, shipping = $0**, both configurable); COD availability; whether guests can be emailed order updates. | Not specified in the update notes. |

### 0012a — enum additions (own file)

```sql
-- 0012a_shop_enums.sql
alter type public.notification_type add value if not exists 'shop_order_received';
alter type public.notification_type add value if not exists 'shop_payment_approved';
alter type public.notification_type add value if not exists 'shop_payment_rejected';
alter type public.notification_type add value if not exists 'shop_order_update';
```

### 0012b — tables

```sql
-- 0012b_shop.sql
create type public.shop_order_status   as enum ('Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled');
create type public.shop_payment_method as enum ('cod', 'advance');
create type public.shop_payment_status as enum ('unpaid', 'pending_verification', 'paid', 'refunded');
create type public.shop_order_source   as enum ('portal', 'guest');

create table public.shop_categories (
  name        text primary key,
  sort_order  int not null default 0
);
insert into public.shop_categories (name, sort_order) values
  ('Workbooks', 1), ('Flash Cards', 2), ('Activity Kits', 3);

create table public.shop_products (
  id                   uuid primary key default gen_random_uuid(),
  category             text not null references public.shop_categories(name) on update cascade,
  title                text not null check (length(btrim(title)) between 1 and 200),
  description          text not null default '',               -- short, card
  details              text not null default '',               -- long, modal
  price_cents          int  not null check (price_cents >= 0),
  image_path           text,                                    -- Storage: shop-products/{id}/{file}; null => UI gradient fallback
  stock_quantity       int  not null default 0 check (stock_quantity >= 0),
  low_stock_threshold  int  not null default 5 check (low_stock_threshold >= 0),
  status               text generated always as (
                         case when stock_quantity <= 0 then 'Out of Stock'
                              when stock_quantity <= low_stock_threshold then 'Low Stock'
                              else 'In Stock' end) stored,
  is_active            boolean not null default true,
  sort_order           int not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index shop_products_active_idx on public.shop_products (sort_order, title) where is_active;

create sequence public.shop_order_seq start 1001;

create table public.shop_orders (
  id                   uuid primary key,                         -- CLIENT-GENERATED uuid = idempotency key + receipt folder
  order_number         text not null unique default ('FBO-' || nextval('public.shop_order_seq')),
  source               public.shop_order_source not null,
  family_id            uuid references public.families(id) on delete restrict,   -- null for guests
  placed_by            uuid references public.profiles(id) on delete set null,
  customer_name        text not null,                             -- snapshot: parent name (portal) or delivery name (guest)
  status               public.shop_order_status not null default 'Pending',
  payment_method       public.shop_payment_method not null,
  payment_status       public.shop_payment_status not null,
  subtotal_cents       int not null check (subtotal_cents >= 0),
  shipping_cents       int not null default 0 check (shipping_cents >= 0),
  total_cents          int generated always as (subtotal_cents + shipping_cents) stored,
  receipt_path         text,                                      -- Storage: shop-receipts/{family_id|guest}/{order_id}/{file}
  receipt_filename     text,
  receipt_uploaded_at  timestamptz,
  delivery_name        text not null check (char_length(delivery_name)    between 1 and 120),
  delivery_address     text not null check (char_length(delivery_address) between 1 and 500),
  delivery_phone       text not null check (char_length(delivery_phone)   between 5 and 40),
  delivery_email       text,
  guest_ip_hash        text,                                      -- salted SHA-256; for rate limiting only, never the raw IP
  reviewed_by          uuid references public.profiles(id),
  reviewed_at          timestamptz,
  review_note          text,
  stock_released       boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check ((source = 'portal' and family_id is not null) or (source = 'guest' and family_id is null)),
  check (source <> 'guest' or (delivery_email is not null and delivery_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  check (payment_method <> 'advance' or receipt_path is not null)
);
create index shop_orders_family_idx  on public.shop_orders (family_id, created_at desc);
create index shop_orders_created_idx on public.shop_orders (created_at desc);
create index shop_orders_pending_idx on public.shop_orders (created_at) where payment_status = 'pending_verification';
create index shop_orders_guest_ip_idx on public.shop_orders (guest_ip_hash, created_at) where guest_ip_hash is not null;

create table public.shop_order_items (
  id                bigint generated always as identity primary key,
  order_id          uuid not null references public.shop_orders(id) on delete cascade,
  product_id        uuid references public.shop_products(id) on delete set null,
  title             text not null,                                -- snapshots: survive product edits/deletes
  unit_price_cents  int  not null check (unit_price_cents >= 0),
  quantity          int  not null check (quantity between 1 and 999)
);
create index shop_order_items_order_idx on public.shop_order_items (order_id);

-- Generic, tiny rate-limit ledger used by the guest-checkout Edge Function (service role only).
create table public.rate_limit_hits (
  id          bigint generated always as identity primary key,
  bucket      text not null,
  key         text not null,
  created_at  timestamptz not null default now()
);
create index rate_limit_hits_idx on public.rate_limit_hits (bucket, key, created_at);

create trigger set_updated_at before update on public.shop_products for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.shop_orders   for each row execute function private.set_updated_at();
```

### 0012b — settings, notification category

```sql
-- Public (anon-readable) info used by guest checkout + receipts. Replaces bank/contact fields formerly inside `business`.
insert into public.app_settings (key, value, description, is_public) values
('public_info', jsonb_build_object(
   'contact_email', 'hello@fairybreadandfractions.com',
   'phone',         '(02) 4000 1234',
   'bank', jsonb_build_object('account_name','Fairybread & Fractions Tutoring','bsb','000 000','account_number','00000000')),
 'Shown to everyone who reaches checkout (including guests). Replace the bank details before go-live.', true),
('shop', jsonb_build_object(
   'cod_enabled',              true,
   'advance_enabled',          true,
   'guest_checkout_enabled',   true,
   'shipping_cents',           0,
   'max_qty_per_line',         20,
   'max_lines',                30,
   'guest_orders_per_ip_hour', 5,
   'advance_hold_days',        3),
 'TODO: confirm with client — shipping fee, COD availability, GST treatment of shop prices (currently: price is final). Safe to expose publicly.', true)
on conflict (key) do nothing;

-- If 0003 was ALREADY applied (bank/contact still inside `business`), carry them over once, by hand:
--   update public.app_settings pi set value = jsonb_build_object(
--       'contact_email', b.value->'contact_email', 'phone', b.value->'phone', 'bank', b.value->'bank')
--     from public.app_settings b where pi.key = 'public_info' and b.key = 'business';
--   update public.app_settings set value = value - 'bank' - 'contact_email' - 'phone' where key = 'business';

-- New preference category 'orders'
alter table public.notification_preferences drop constraint if exists notification_preferences_category_check;
alter table public.notification_preferences add  constraint notification_preferences_category_check
  check (category in ('new_bookings','cancellations','payments','reports','reminders','messages','announcements','orders'));

-- Supersedes the version created in 0004 (same signature) — adds the four shop types → 'orders'.
create or replace function private.notif_category(p_type public.notification_type) returns text
language sql immutable set search_path = '' as $$
  select case p_type::text
    when 'booking_confirmed'      then 'new_bookings'
    when 'waitlist_spot_open'     then 'new_bookings'
    when 'enrolment_completed'    then 'new_bookings'
    when 'booking_cancelled'      then 'cancellations'
    when 'session_cancelled'      then 'cancellations'
    when 'payment_received'       then 'payments'
    when 'payment_approved'       then 'payments'
    when 'payment_rejected'       then 'payments'
    when 'report_ready'           then 'reports'
    when 'term_expiring'          then 'reminders'
    when 'session_reminder'       then 'reminders'
    when 'assessment_confirmed'   then 'reminders'
    when 'message_received'       then 'messages'
    when 'shop_order_received'    then 'orders'
    when 'shop_payment_approved'  then 'orders'
    when 'shop_payment_rejected'  then 'orders'
    when 'shop_order_update'      then 'orders'
    else 'announcements' end
$$;
```

### 0012b — functions

```sql
-- ── Rate limiter (service role only; used by the Edge Function) ──────────────
create or replace function public.check_rate_limit(p_bucket text, p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  select count(*) into v_n from public.rate_limit_hits
   where bucket = p_bucket and key = p_key and created_at > now() - make_interval(secs => p_window_seconds);
  if v_n >= p_max then return false; end if;
  insert into public.rate_limit_hits (bucket, key) values (p_bucket, p_key);
  return true;
end $$;

-- ── Public catalogue: status only, never stock counts ────────────────────────
create or replace function public.get_shop_products()
returns table (id uuid, category text, title text, description text, details text,
               price_cents int, image_path text, status text, sort_order int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.category, p.title, p.description, p.details, p.price_cents, p.image_path, p.status, p.sort_order
    from public.shop_products p
   where p.is_active
   order by p.sort_order, p.title
$$;

-- ── Core order creation (called ONLY by the two wrappers below and by the seed) ─
create or replace function private.create_shop_order(
  p_id uuid, p_source public.shop_order_source, p_family uuid, p_actor uuid, p_customer_name text,
  p_items jsonb, p_method public.shop_payment_method, p_delivery jsonb,
  p_receipt_path text, p_receipt_filename text, p_ip_hash text
) returns public.shop_orders
language plpgsql security definer set search_path = '' as $$
declare
  v_cfg       jsonb := coalesce(private.setting('shop'), '{}'::jsonb);
  v_max_qty   int   := coalesce((v_cfg->>'max_qty_per_line')::int, 20);
  v_max_lines int   := coalesce((v_cfg->>'max_lines')::int, 30);
  v_ship      int   := coalesce((v_cfg->>'shipping_cents')::int, 0);
  v_name      text  := btrim(coalesce(p_delivery->>'name', ''));
  v_addr      text  := btrim(coalesce(p_delivery->>'address', ''));
  v_phone     text  := btrim(coalesce(p_delivery->>'phone', ''));
  v_email     text  := nullif(btrim(coalesce(p_delivery->>'email', '')), '');
  v_ex        public.shop_orders;
  v_order     public.shop_orders;
  v_norm      jsonb;
  r           record;
  v_subtotal  bigint := 0;
  v_lines     int := 0;
begin
  -- idempotent retry (same client-generated id)
  select * into v_ex from public.shop_orders where id = p_id;
  if found then
    if v_ex.source <> p_source or v_ex.family_id is distinct from p_family then raise exception 'forbidden' using errcode = '42501'; end if;
    return v_ex;
  end if;

  -- input validation (never trust the client)
  if coalesce(jsonb_typeof(p_items), '') <> 'array' then raise exception 'invalid_input'; end if;
  if jsonb_array_length(p_items) not between 1 and v_max_lines then raise exception 'invalid_input'; end if;
  if exists (select 1 from jsonb_array_elements(p_items) e
              where coalesce(e->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 or coalesce(e->>'quantity', '')   !~  '^[0-9]{1,3}$') then
    raise exception 'invalid_input';
  end if;
  if v_name = '' or char_length(v_name) > 120 or v_addr = '' or char_length(v_addr) > 500
     or char_length(v_phone) not between 5 and 40 then raise exception 'invalid_input'; end if;
  if v_email is not null and v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_input'; end if;
  if p_source = 'guest' and v_email is null then raise exception 'invalid_input'; end if;

  if p_method = 'cod'     and not coalesce((v_cfg->>'cod_enabled')::boolean,     true) then raise exception 'payment_method_disabled'; end if;
  if p_method = 'advance' and not coalesce((v_cfg->>'advance_enabled')::boolean, true) then raise exception 'payment_method_disabled'; end if;
  if p_method = 'advance' and p_receipt_path is null then raise exception 'proof_missing'; end if;

  -- merge duplicate lines
  select jsonb_agg(jsonb_build_object('product_id', x.pid, 'qty', x.q)) into v_norm
    from (select (e->>'product_id')::uuid as pid, sum((e->>'quantity')::int) as q
            from jsonb_array_elements(p_items) e group by 1) x;

  -- lock products in id order (deadlock-free), check stock, price from the DB
  for r in
    select p.id, p.price_cents, p.stock_quantity, p.is_active, x.qty
      from jsonb_to_recordset(v_norm) as x(product_id uuid, qty int)
      join public.shop_products p on p.id = x.product_id
     order by p.id
       for update of p
  loop
    if not r.is_active or r.stock_quantity < r.qty then raise exception 'out_of_stock'; end if;
    if r.qty > v_max_qty then raise exception 'invalid_input'; end if;
    v_subtotal := v_subtotal + r.price_cents::bigint * r.qty;
    v_lines := v_lines + 1;
  end loop;
  if v_lines = 0 or v_lines <> jsonb_array_length(v_norm) then raise exception 'product_unavailable'; end if;
  if v_subtotal > 10000000 then raise exception 'invalid_input'; end if;

  insert into public.shop_orders
    (id, source, family_id, placed_by, customer_name, status, payment_method, payment_status,
     subtotal_cents, shipping_cents, receipt_path, receipt_filename, receipt_uploaded_at,
     delivery_name, delivery_address, delivery_phone, delivery_email, guest_ip_hash)
  values
    (p_id, p_source, p_family, p_actor, coalesce(nullif(btrim(p_customer_name), ''), v_name), 'Pending', p_method,
     (case when p_method = 'advance' then 'pending_verification' else 'unpaid' end)::public.shop_payment_status,
     v_subtotal::int, v_ship,
     case when p_method = 'advance' then p_receipt_path end,
     case when p_method = 'advance' then p_receipt_filename end,
     case when p_method = 'advance' then now() end,
     v_name, v_addr, v_phone, v_email, p_ip_hash)
  returning * into v_order;

  insert into public.shop_order_items (order_id, product_id, title, unit_price_cents, quantity)
  select v_order.id, p.id, p.title, p.price_cents, x.qty
    from jsonb_to_recordset(v_norm) as x(product_id uuid, qty int)
    join public.shop_products p on p.id = x.product_id;

  update public.shop_products p set stock_quantity = p.stock_quantity - x.qty
    from jsonb_to_recordset(v_norm) as x(product_id uuid, qty int)
   where p.id = x.product_id;

  perform private.notify_admins('shop_order_received', 'New shop order',
    format('%s placed order %s ($%s, %s).', v_order.customer_name, v_order.order_number,
           to_char(v_order.total_cents / 100.0, 'FM999990.00'),
           case when p_method = 'advance' then 'bank transfer — verify payment' else 'cash on delivery' end),
    '/admin/orders', jsonb_build_object('order_id', v_order.id, 'source', p_source));
  return v_order;
end $$;

create or replace function private.release_shop_stock(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i record;
begin
  if (select stock_released from public.shop_orders where id = p_order) then return; end if;
  for i in select product_id, quantity from public.shop_order_items
            where order_id = p_order and product_id is not null order by product_id loop     -- same lock order as create
    update public.shop_products set stock_quantity = stock_quantity + i.quantity where id = i.product_id;
  end loop;
  update public.shop_orders set stock_released = true where id = p_order;
end $$;

-- ── Portal order (signed-in parent). Family comes from the JWT, not the client. ──
-- Upload the receipt FIRST to shop-receipts/{family_id}/{p_id}/{file} (advance only), then call this.
create or replace function public.place_portal_order(
  p_id uuid, p_items jsonb, p_method public.shop_payment_method, p_delivery jsonb,
  p_receipt_path text default null, p_receipt_filename text default null
) returns public.shop_orders language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_fam uuid := private.my_family_id(); v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_fam is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_method = 'advance' and (
       p_receipt_path is null or p_receipt_path not like (v_fam::text || '/' || p_id::text || '/%')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'shop-receipts' and o.name = p_receipt_path)) then
    raise exception 'proof_missing';
  end if;
  select parent_name into v_name from public.families where id = v_fam;
  return private.create_shop_order(p_id, 'portal', v_fam, v_uid, v_name, p_items, p_method, p_delivery,
                                   p_receipt_path, p_receipt_filename, null);
end $$;

-- ── Guest order (Edge Function / service role ONLY — never callable by anon/authenticated) ──
create or replace function public.place_guest_order(
  p_id uuid, p_items jsonb, p_method public.shop_payment_method, p_delivery jsonb,
  p_receipt_path text, p_receipt_filename text, p_ip_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_cfg jsonb := coalesce(private.setting('shop'), '{}'::jsonb); v_o public.shop_orders;
begin
  if not coalesce((v_cfg->>'guest_checkout_enabled')::boolean, true) then raise exception 'guest_checkout_disabled'; end if;
  if coalesce(p_ip_hash, '') = '' then raise exception 'invalid_input'; end if;
  if (select count(*) from public.shop_orders where guest_ip_hash = p_ip_hash and created_at > now() - interval '1 hour')
       >= coalesce((v_cfg->>'guest_orders_per_ip_hour')::int, 5) then
    raise exception 'rate_limited';
  end if;
  if p_method = 'advance' and (
       p_receipt_path is null or p_receipt_path not like ('guest/' || p_id::text || '/%')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'shop-receipts' and o.name = p_receipt_path)) then
    raise exception 'proof_missing';
  end if;
  v_o := private.create_shop_order(p_id, 'guest', null, null, null, p_items, p_method, p_delivery,
                                   p_receipt_path, p_receipt_filename, p_ip_hash);
  return jsonb_build_object('id', v_o.id, 'order_number', v_o.order_number, 'total_cents', v_o.total_cents,
                            'status', v_o.status, 'payment_status', v_o.payment_status, 'created_at', v_o.created_at);
end $$;

-- ── Admin: verify bank-transfer payment ──────────────────────────────────────
create or replace function public.verify_shop_order(p_order_id uuid, p_action text, p_note text default null)
returns public.shop_orders language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); o public.shop_orders;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'invalid_action'; end if;
  select * into o from public.shop_orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.payment_method <> 'advance' or o.payment_status <> 'pending_verification' or o.status = 'Cancelled' then
    raise exception 'payment_not_pending';
  end if;

  if p_action = 'approve' then
    update public.shop_orders
       set payment_status = 'paid',
           status = case when status = 'Pending' then 'Processing'::public.shop_order_status else status end,
           reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
     where id = o.id returning * into o;
    if o.family_id is not null then
      perform private.notify_family(o.family_id, 'shop_payment_approved', 'Order payment verified',
        format('Payment for order %s was verified. We''re preparing your items.', o.order_number),
        '/parent/orders', jsonb_build_object('order_id', o.id));
    end if;
  else
    update public.shop_orders
       set payment_status = 'unpaid', status = 'Pending',
           reviewed_by = v_uid, reviewed_at = now(), review_note = p_note
     where id = o.id returning * into o;
    if o.family_id is not null then
      perform private.notify_family(o.family_id, 'shop_payment_rejected', 'Order payment could not be verified',
        coalesce(nullif(btrim(p_note), ''), format('We couldn''t verify the payment for order %s. Please contact us.', o.order_number)),
        '/parent/orders', jsonb_build_object('order_id', o.id));
    end if;
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'shop_order.' || p_action, 'shop_order', o.id::text, jsonb_build_object('note', p_note, 'total_cents', o.total_cents, 'source', o.source));
  return o;
end $$;

-- ── Admin: move an order through its lifecycle ───────────────────────────────
create or replace function public.admin_update_shop_order_status(p_order_id uuid, p_status public.shop_order_status, p_note text default null)
returns public.shop_orders language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); o public.shop_orders; v_ok boolean;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into o from public.shop_orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;

  v_ok := (o.status = 'Pending'    and p_status in ('Processing', 'Cancelled'))
       or (o.status = 'Processing' and p_status in ('Shipped', 'Cancelled'))
       or (o.status = 'Shipped'    and p_status = 'Delivered');
  if not v_ok then raise exception 'invalid_transition'; end if;
  if p_status = 'Processing' and o.payment_method = 'advance' and o.payment_status <> 'paid' then raise exception 'payment_required'; end if;

  if p_status = 'Cancelled' then
    perform private.release_shop_stock(o.id);
    update public.shop_orders
       set status = 'Cancelled',
           payment_status = (case when payment_status = 'paid' then 'refunded' else 'unpaid' end)::public.shop_payment_status,
           review_note = coalesce(p_note, review_note)
     where id = o.id returning * into o;           -- 'refunded' is a flag: the admin must refund the money manually
  else
    update public.shop_orders
       set status = p_status,
           payment_status = case when p_status = 'Delivered' and payment_method = 'cod'
                                 then 'paid'::public.shop_payment_status else payment_status end
     where id = o.id returning * into o;
  end if;

  if o.family_id is not null and p_status in ('Shipped', 'Delivered', 'Cancelled') then
    perform private.notify_family(o.family_id, 'shop_order_update',
      case p_status when 'Shipped' then 'Your order is on its way' when 'Delivered' then 'Order delivered' else 'Order cancelled' end,
      format('Order %s is now %s.', o.order_number, lower(p_status::text)),
      '/parent/orders', jsonb_build_object('order_id', o.id, 'status', p_status));
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (v_uid, 'shop_order.status', 'shop_order', o.id::text, jsonb_build_object('status', p_status, 'note', p_note));
  return o;
end $$;

create or replace function public.admin_shop_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'total_orders',         (select count(*) from public.shop_orders),
    'pending_verification', (select count(*) from public.shop_orders where payment_status = 'pending_verification'),
    'revenue_cents',        (select coalesce(sum(total_cents), 0) from public.shop_orders where payment_status = 'paid'),
    'low_stock_products',   (select count(*) from public.shop_products where is_active and stock_quantity <= low_stock_threshold));
end $$;

-- ── Housekeeping: cancel rejected/unpaid advance orders so stock isn't held forever ──
create or replace function private.cancel_stale_advance_orders() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0; v_days int := coalesce((private.setting('shop')->>'advance_hold_days')::int, 3);
begin
  for r in select id, family_id, order_number from public.shop_orders
            where payment_method = 'advance' and payment_status = 'unpaid' and status = 'Pending'
              and coalesce(reviewed_at, created_at) < now() - make_interval(days => v_days)
            order by id for update loop
    perform private.release_shop_stock(r.id);
    update public.shop_orders set status = 'Cancelled' where id = r.id;
    if r.family_id is not null then
      perform private.notify_family(r.family_id, 'shop_order_update', 'Order cancelled',
        format('Order %s was cancelled because payment was not completed.', r.order_number),
        '/parent/orders', jsonb_build_object('order_id', r.id));
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
```

### 0012b — RLS, privileges (re-apply the deny-by-default pattern!)

> ⚠️ **Supabase grants new tables/functions to `anon`/`authenticated` by default.** The blanket `revoke` in §11 only covered objects that existed at that time, so **every later migration must explicitly revoke then grant** — as done below. Add this check to code review.

```sql
alter table public.shop_categories  enable row level security;
alter table public.shop_products    enable row level security;
alter table public.shop_orders      enable row level security;
alter table public.shop_order_items enable row level security;
alter table public.rate_limit_hits  enable row level security;     -- no policies: service role only

create policy shop_categories_select on public.shop_categories for select to anon, authenticated using (true);
create policy shop_categories_admin  on public.shop_categories for all    to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Anon and parents read products through get_shop_products(); only admins read the table (stock counts).
create policy shop_products_admin on public.shop_products for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy shop_orders_select on public.shop_orders for select to authenticated
  using (family_id = (select private.my_family_id()) or (select private.is_admin()));
create policy shop_order_items_select on public.shop_order_items for select to authenticated
  using (exists (select 1 from public.shop_orders o where o.id = order_id));            -- inherits order RLS

-- ── privileges ──
alter default privileges in schema private revoke execute on functions from public;     -- future private functions

revoke all on public.shop_categories, public.shop_products, public.shop_orders, public.shop_order_items, public.rate_limit_hits
  from anon, authenticated;
revoke all on sequence public.shop_order_seq from anon, authenticated;
revoke execute on function
  public.get_shop_products(), public.check_rate_limit(text, text, int, int),
  public.place_portal_order(uuid, jsonb, public.shop_payment_method, jsonb, text, text),
  public.place_guest_order(uuid, jsonb, public.shop_payment_method, jsonb, text, text, text),
  public.verify_shop_order(uuid, text, text),
  public.admin_update_shop_order_status(uuid, public.shop_order_status, text),
  public.admin_shop_stats()
  from public, anon, authenticated;
revoke execute on function
  private.create_shop_order(uuid, public.shop_order_source, uuid, uuid, text, jsonb, public.shop_payment_method, jsonb, text, text, text),
  private.release_shop_stock(uuid), private.cancel_stale_advance_orders()
  from public, anon, authenticated;

grant select on public.shop_categories to anon, authenticated;
grant insert, update, delete on public.shop_categories to authenticated;                -- admin via policy
grant select on public.shop_products, public.shop_orders, public.shop_order_items to authenticated;
grant insert (category, title, description, details, price_cents, image_path, stock_quantity, low_stock_threshold, is_active, sort_order),
      update (category, title, description, details, price_cents, image_path, stock_quantity, low_stock_threshold, is_active, sort_order)
  on public.shop_products to authenticated;                                              -- admin via policy; no DELETE: deactivate instead
-- Intentionally NO write grants on shop_orders / shop_order_items → RPC only.

grant execute on function public.get_shop_products() to anon, authenticated;
grant execute on function
  public.place_portal_order(uuid, jsonb, public.shop_payment_method, jsonb, text, text),
  public.verify_shop_order(uuid, text, text),
  public.admin_update_shop_order_status(uuid, public.shop_order_status, text),
  public.admin_shop_stats()
  to authenticated;
grant execute on function
  public.place_guest_order(uuid, jsonb, public.shop_payment_method, jsonb, text, text, text),
  public.check_rate_limit(text, text, int, int)
  to service_role;
```

### 0012b — storage, cron

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('shop-receipts', 'shop-receipts', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('shop-products', 'shop-products', true,   5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Portal receipts: {family_id}/{order_id}/{file}. Immutable evidence: no update/delete from clients.
create policy shop_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-receipts' and (storage.foldername(name))[1] = (select private.my_family_id())::text);
create policy shop_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'shop-receipts'
         and ((storage.foldername(name))[1] = (select private.my_family_id())::text or (select private.is_admin())));
-- Guest receipts ('guest/{order_id}/{file}') are uploaded with one-shot SIGNED upload URLs minted by the Edge Function
-- (service role), so anon needs no storage policy at all. Admins read them via the select policy above.

-- Product images: public read (public bucket); only admins write.
create policy shop_products_img_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-products' and (select private.is_admin()));
create policy shop_products_img_update on storage.objects for update to authenticated
  using (bucket_id = 'shop-products' and (select private.is_admin()));
create policy shop_products_img_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shop-products' and (select private.is_admin()));

select cron.schedule('fb-shop-stale-orders',  '0 17 * * *',   $$select private.cancel_stale_advance_orders()$$);
select cron.schedule('fb-prune-rate-limits',  '*/30 * * * *', $$delete from public.rate_limit_hits where created_at < now() - interval '1 day'$$);
```

### 0012b — entity map for the shop

```
shop_categories ─< shop_products ─< shop_order_items >─ shop_orders >─ families (portal only; guests have family_id = null)
                                                              └─ receipt in Storage: shop-receipts/{family_id|guest}/{order_id}/{file}
```

| Frontend (`src/types/shop.ts`) | DB |
|---|---|
| `ShopProduct` (`price`, `status`, `image_url`) | `get_shop_products()` → `price_cents`, `status`, `image_path` → public URL |
| `ShopOrder.id` | `shop_orders.order_number` for display, `shop_orders.id` as the key |
| `ShopOrder.family_id: 'guest'` | `family_id = null` + `source = 'guest'` (the mapper may re-create the `'guest'` sentinel for the UI) |
| `ShopOrder.family_name` | `customer_name` |
| `ShopOrder.total`, `items[].price` | `total_cents`, `shop_order_items.unit_price_cents` |
| `ShopOrder.status` | `shop_order_status` (adds `Cancelled`) |
| `ShopOrder.payment_status` | `shop_payment_status` (adds `refunded`) |
| `receipt_filename` | `receipt_filename` (+ `receipt_path` for the signed URL) |

---

## 13B. Migration 0013 — OTP-signup hygiene

> **Why:** the new OTP signup (`SHOP_AND_AUTH_UPDATES.md` §12) creates an `auth.users` row — and, through the trigger in §7, a profile and a family — the moment someone types an email and requests a code, i.e. **before** they prove they own the inbox. Without cleanup, typos and spam leave junk rows forever.

```sql
-- 0013_auth_otp_hygiene.sql
create or replace function private.purge_unverified_users(p_older_than interval default interval '7 days') returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0;
begin
  for r in
    select u.id from auth.users u
     where u.email_confirmed_at is null
       and u.created_at < now() - p_older_than
       and not exists (select 1 from public.profiles p where p.id = u.id and p.role <> 'parent')   -- never touch pending staff invites
  loop
    begin
      -- remove the auto-created family only if it belongs solely to this user and holds no business data
      delete from public.families f
       where f.id in (select fm.family_id from public.family_members fm where fm.profile_id = r.id)
         and not exists (select 1 from public.children    c where c.family_id = f.id)
         and not exists (select 1 from public.terms       t where t.family_id = f.id)
         and not exists (select 1 from public.payments    p where p.family_id = f.id)
         and not exists (select 1 from public.shop_orders o where o.family_id = f.id);
      delete from auth.users where id = r.id;              -- cascades profiles / family_members / devices / notifications
      v_n := v_n + 1;
    exception when others then
      continue;                                             -- one stubborn row must not block the rest
    end;
  end loop;
  return v_n;
end $$;
revoke execute on function private.purge_unverified_users(interval) from public, anon, authenticated;

select cron.schedule('fb-purge-unverified', '0 18 * * 0', $$select private.purge_unverified_users()$$);
```

> **Existing-account note.** With OTP signup, typing an *existing* email at `/signup` and entering the emailed code simply signs that person in and lets them set a new password — the same trust level as password recovery (proof of inbox ownership). The UI must therefore never say "this email is already registered".

---

## 14. Seed data (dev project only) — `supabase/seed.sql`

Recreates the four demo families used throughout the PRD, plus staff. **Never run on the production project.** Run the whole script in **one** SQL Editor query (it uses session-scoped helper functions). Passwords match the old mock so muscle memory still works.

| Login | Password | Role | State |
|---|---|---|---|
| `sarah@example.com` | `demo1234` | parent | **f1** — `ACTIVE_TERM`, 3 credits left |
| `claire@example.com` | `demo1234` | parent | **f2** — `ACTIVE_TERM`, 0 credits |
| `james@example.com` | `demo1234` | parent | **f3** — `TERM_EXPIRED` (+ one pending individual-class payment) |
| `michael@example.com` | `demo1234` | parent | **f4** — `NO_TERM_EVER` (+ one pending term payment) |
| `admin@fairybread.au` | `admin1234` | admin (also a teacher) | |
| `jessica@fairybread.au` | `tutor1234` | teacher | |
| `sarah.w@fairybread.au` | `tutor1234` | teacher | |

```sql
-- supabase/seed.sql   (DEV PROJECT ONLY — run in the SQL Editor)

create or replace function pg_temp.mk_user(p_email text, p_password text, p_meta jsonb default '{}'::jsonb) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)      -- must be '' not NULL for GoTrue
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, p_meta, now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, 'email',
          jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), now(), now(), now());
  return v_id;                                   -- trigger on_auth_user_created made profile + family
end $$;

create or replace function pg_temp.promote(p_user uuid, p_role public.user_role, p_name text) returns void
language plpgsql as $$
declare v_fam uuid;
begin
  select family_id into v_fam from public.family_members where profile_id = p_user;
  delete from public.families where id = v_fam;                       -- staff don't own a family
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
  insert into public.classes (program_id, teacher_id, day_of_week, start_time, capacity) values (p_read, t_ds, 4, '16:00', 1)  returning id into ci3;  -- capacity 1 => easy to show FULL
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

  -- f1: 7 real credit bookings (Emma/Oliver alternating); f2: 10 for Sophie
  insert into public.class_bookings (family_id, child_id, class_session_id, source, status, credit_consumed, term_id)
    select f1, case when x.n % 2 = 0 then c1 else c2 end, x.id, 'term_credit', 'confirmed', true, term1
      from (select s.id, row_number() over (order by s.starts_at) n from public.class_sessions s
             where s.status = 'scheduled' and s.class_id in (ci1, ci2, ci4)) x where x.n <= 7;
  insert into public.class_bookings (family_id, child_id, class_session_id, source, status, credit_consumed, term_id)
    select f2, c3, x.id, 'term_credit', 'confirmed', true, term2
      from (select s.id, row_number() over (order by s.starts_at) n from public.class_sessions s
             where s.status = 'scheduled' and s.class_id in (ci1, ci2, ci4)) x where x.n <= 10;

  -- f3: 8 historical sessions inside its expired term (+ attendance), so "2 unused credits" is real
  insert into public.class_sessions (class_id, session_date, starts_at, ends_at, capacity, status)
    select ci4, today - 16 - 8 * g, (today - 16 - 8 * g + time '15:00') at time zone 'Australia/Sydney',
           (today - 16 - 8 * g + time '16:00') at time zone 'Australia/Sydney', 12, 'completed' from generate_series(0, 7) g;
  insert into public.class_bookings (family_id, child_id, class_session_id, source, status, credit_consumed, term_id)
    select f3, c4, s.id, 'term_credit', 'confirmed', true, term3 from public.class_sessions s where s.status = 'completed';
  insert into public.attendance (class_session_id, child_id, status)
    select b.class_session_id, b.child_id, case when row_number() over (order by b.created_at) = 3 then 'absent' else 'present' end::public.attendance_status
      from public.class_bookings b where b.term_id = term3;

  -- f3: one confirmed individual purchase making the Reading class FULL for its next session
  pay4 := gen_random_uuid();
  insert into public.payments (id, family_id, type, status, amount_cents, gst_cents, reference, child_id, recorded_by_admin, reviewed_at, details)
    values (pay4, f3, 'individual_class', 'paid', 5000, 500, 'FB-SEED-F3-C', c4, true, now(), '{"subject":"Reading & Spelling"}');
  insert into public.class_bookings (family_id, child_id, class_session_id, source, status, payment_id)
    select f3, c4, s.id, 'individual_purchase', 'confirmed', pay4 from public.class_sessions s
     where s.class_id = ci3 and s.status = 'scheduled' order by s.starts_at limit 1 returning id into bk;
  insert into public.individual_class_purchases (family_id, class_booking_id, payment_id) values (f3, bk, pay4);

  -- Pending payments for the admin queue (placeholder proof paths: fine for the DB check; only the RPC verifies Storage)
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

  -- Consistent counters + ledger (derived from the rows above)
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

  -- ── Learning Shop: the six demo products from the old mock (descriptions are placeholders) ──
  insert into public.shop_products (category, title, description, details, price_cents, stock_quantity, low_stock_threshold, sort_order) values
    ('Workbooks',     'Fractions Fun Workbook',        'Colourful practice pages for fractions.',        'Placeholder long description — replace via Admin → Shop products.', 1800, 40, 5, 1),
    ('Workbooks',     'English Grammar Essentials',    'Grammar basics with worked examples.',            'Placeholder long description.', 2000, 25, 5, 2),
    ('Flash Cards',   'Reading Comprehension Cards',   'Short passages with question prompts.',           'Placeholder long description.', 1400,  3, 5, 3),   -- Low Stock
    ('Flash Cards',   'Times Tables Mastery Pack',     'Cards for 2× to 12× tables.',                     'Placeholder long description.', 1200, 60, 5, 4),
    ('Activity Kits', 'Creative Writing Starter Kit',  'Story starters, prompts and a journal.',          'Placeholder long description.', 2800, 15, 5, 5),
    ('Activity Kits', 'Maths Problem Solving Pack',    'Hands-on puzzles and challenges.',                'Placeholder long description.', 2400,  0, 5, 6);   -- Out of Stock

  -- A COD portal order (f1), an advance order awaiting verification (f4), and a guest COD order.
  perform private.create_shop_order(gen_random_uuid(), 'portal', f1, u1, 'Sarah Johnson',
    jsonb_build_array(jsonb_build_object('product_id', (select id from public.shop_products where title = 'Fractions Fun Workbook'), 'quantity', 2)),
    'cod', '{"name":"Sarah Johnson","address":"12 Example St, Sydney NSW 2000","phone":"0400 000 001","email":"sarah@example.com"}'::jsonb,
    null, null, null);
  perform private.create_shop_order(gen_random_uuid(), 'portal', f4, u4, 'Michael Chen',
    jsonb_build_array(jsonb_build_object('product_id', (select id from public.shop_products where title = 'Times Tables Mastery Pack'), 'quantity', 1)),
    'advance', '{"name":"Michael Chen","address":"4 Sample Rd, Parramatta NSW 2150","phone":"0400 000 004","email":"michael@example.com"}'::jsonb,
    f4 || '/seed-order/receipt.jpg', 'receipt.jpg', null);                       -- placeholder path: only the wrappers check Storage
  perform private.create_shop_order(gen_random_uuid(), 'guest', null, null, null,
    jsonb_build_array(jsonb_build_object('product_id', (select id from public.shop_products where title = 'English Grammar Essentials'), 'quantity', 1)),
    'cod', '{"name":"Guest Buyer","address":"1 Guest Ln, Newtown NSW 2042","phone":"0400 111 222","email":"guest@example.com"}'::jsonb,
    null, null, 'seed-ip-hash');
end
$seed$;
```

### 14.1 `supabase/dev_reset.sql` — wipe business data on the DEV project

Replaces `db reset`. Keeps the schema, functions, settings, categories and documents; removes every family, class, payment, order, notification and **every auth user**. Run it, then run the seed again. **Never run on production.**

```sql
begin;
truncate table
  public.families, public.teachers, public.programs, public.closures,
  public.shop_products, public.rate_limit_hits, public.audit_log, public.notifications
  restart identity cascade;                        -- cascades to children, terms, payments, bookings, orders, messages, …

update public.app_settings set updated_by = null;  -- otherwise these FKs would block deleting the admin's profile
update public.documents    set updated_by = null;
delete from auth.users;                            -- cascades profiles, family_members, devices, notification preferences

alter sequence public.family_ref_seq restart with 1001;
alter sequence public.shop_order_seq restart with 1001;
commit;
```

Storage files are not removed by SQL (Supabase blocks direct deletes on storage tables) — empty the buckets from Dashboard → Storage if needed. The SQL Editor will warn about destructive statements; that is expected here.

> **Single project?** Before going live, run this reset, confirm `select count(*) from auth.users;` is 0, then create the real admin (§7 note).

---

## 15. Verification

### 15.1 Invariants (run after seed and nightly in monitoring) — must return **0 rows**

```sql
select * from public.v_counter_drift;

-- No overlapping terms, no negative credits (also enforced by constraints)
select family_id from public.terms where classes_remaining < 0;

-- Every pending payment has proof
select id from public.payments where status = 'pending' and proof_path is null;
```

### 15.2 RLS smoke tests (SQL editor)

```sql
-- Helper: act as a user for one transaction
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.profiles where email = 'sarah@example.com'), 'role', 'authenticated')::text, true);

  select count(*) from public.payments;              -- expect: only f1's payments
  select count(*) from public.children;              -- expect: Emma + Oliver only
  select count(*) from public.class_rates;           -- expect: 0  (teacher price hidden from parents)
  select count(*) from public.profiles;              -- expect: 1  (self)
  update public.profiles set role = 'admin' where id = auth.uid();    -- expect: permission denied for column role
  insert into public.terms (family_id, start_date, end_date, classes_included)
    values ((select family_id from public.family_members limit 1), current_date, current_date + 70, 99);  -- expect: permission denied
  select public.book_class_session(
    (select id from public.children where given_name = 'Emma'),
    (select id from public.class_sessions where status = 'scheduled' order by starts_at limit 1));          -- expect: ok (f1 has 3 credits)
rollback;
```

### 15.3 Behaviour matrix to check through the API (parent `f*` ≙ seed families)

| Scenario | Expected |
|---|---|
| f1 books a class | Succeeds; credits 3 → 2; ledger row `-1`; teacher + family notified |
| f2 books a class | `no_credits` |
| f3 books by credit | `term_expired`; individual class payment allowed |
| f4 books by credit **or** submits an individual-class payment | `no_term_ever` |
| f1 cancels ≥ 24h before | `credit_restored = true`, credits +1 |
| f1 cancels < 24h before | `credit_restored = false`, credits unchanged, seat freed |
| Two parents race for the last seat (`Reading`, capacity 1) | Exactly one succeeds; the other gets `class_full` |
| Parent calls `verify_payment` | `forbidden` |
| Admin approves f4's term payment | New 10-credit term from today; f4 `ACTIVE_TERM`; `payment_approved` notification |
| Admin approves a second term for f1 (still active) | New term starts at f1's current `end_date`; status `scheduled` |
| Parent B reads parent A's proof file via Storage | Denied |
| Same `submit_payment` call retried with the same `p_id` | Returns the existing payment; no duplicate; no second notification |
| Parent calls `place_portal_order` with a tampered price / `family_id` | Price and family come from the DB / JWT; tampered fields have no effect |
| Order 2 units of the **Out of Stock** product | `out_of_stock` |
| Two buyers race for the last unit of the Low-Stock product | Exactly one succeeds; stock never goes negative |
| Anonymous `select` on `shop_orders` / `shop_products` / `rpc place_guest_order` | Permission denied; only `get_shop_products()` works |
| Admin `verify_shop_order` approve on an advance order | `payment_status = paid`, `status = Processing`, parent notified |
| Admin sets `Pending → Shipped` | `invalid_transition` |
| Admin cancels a Processing order | Stock returned; paid orders flagged `refunded` |
| 6th guest order from the same IP hash within an hour | `rate_limited` |

---

## 16. Operational notes

- **Backups:** enable Point-in-Time Recovery on the production project (payments and consent signatures are legal records).
- **Auth settings (Dashboard → Authentication):** enable *Confirm email*; set Site URL + redirect URLs for web (`https://<app>/**`) and, later, the mobile deep-link scheme; enable *Leaked password protection*; minimum password length 8.
- **Email OTP (signup + password reset):** in Auth → Providers → Email set OTP length **6**, OTP expiry **600 s**; the **Confirm signup**, **Magic Link** and **Reset Password** templates must all contain `{{ .Token }}` (templates in `BACKEND_IMPLEMENTATION.md` §4.4). Supabase enforces a minimum interval between auth emails (default 60 s) — the UI resend timer must match it.
- **Rate limits:** keep Supabase Auth rate limits at defaults; add a CAPTCHA (hCaptcha/Turnstile) to signup and to guest checkout before launch.
- **Privilege hygiene:** Supabase grants new tables/functions to `anon`/`authenticated` by default. Every migration that adds objects must `revoke` first and `grant` explicitly (see §13A "privileges").
- **Guest-order data:** guest orders hold personal data (name, address, phone, email) with no account to delete. Decide a retention period; delete or anonymise guest orders older than that.
- **Service role key** never ships to a client. It exists only inside Edge Functions and CI.
- **Schema changes:** always a new numbered file, applied through the SQL Editor on dev first and then prod, and recorded in `MIGRATIONS_LOG.md`; regenerate `database.types.ts` if you use it; run the §15.1 queries.
- **Dashboard access = full data access.** Enable 2FA for every Supabase organisation member; keep the member list minimal.
- **Future-proofing for React Native:** nothing in this schema is web-specific. RN uses the same Auth, RPCs, Storage and `user_devices` (`platform = 'ios' | 'android'`). Apple requires in-app **account deletion** for apps with sign-up — plan a `delete-account` Edge Function (see `BACKEND_IMPLEMENTATION.md` §12).
