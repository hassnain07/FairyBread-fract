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
  reference_code          text not null unique default ('FB' || nextval('public.family_ref_seq')),
  parent_name             text not null,
  email                   text,
  phone                   text,
  secondary_phone         text,
  address                 text,
  relationship            text,
  emergency_name          text,
  emergency_relationship  text,
  emergency_phone         text,
  referral_source         text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index families_email_idx on public.families (lower(email));

create table public.family_members (
  family_id    uuid not null references public.families(id) on delete cascade,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  relationship text,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (family_id, profile_id),
  unique (profile_id)
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
  enrolled_at           timestamptz,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, family_id)
);
create index children_family_idx on public.children (family_id);

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
  is_public   boolean not null default false,
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now()
);

create table public.documents (
  key               text primary key,
  storage_path      text not null,
  version           int  not null default 1,
  original_filename text,
  updated_by        uuid references public.profiles(id),
  updated_at        timestamptz not null default now()
);

create table public.closures (
  closure_date date primary key,
  reason       text
);

-- ── Classes ───────────────────────────────────────────────────────────────────
create table public.classes (
  id               uuid primary key default gen_random_uuid(),
  program_id       uuid not null references public.programs(id),
  teacher_id       uuid not null references public.teachers(id),
  day_of_week      smallint not null check (day_of_week between 1 and 7),
  start_time       time not null,
  duration_minutes int  not null default 60 check (duration_minutes > 0),
  capacity         int  not null check (capacity > 0),
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index classes_teacher_idx on public.classes (teacher_id);

create table public.class_rates (
  class_id    uuid primary key references public.classes(id) on delete cascade,
  price_cents int not null check (price_cents >= 0),
  updated_at  timestamptz not null default now()
);

create table public.class_sessions (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  session_date  date not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  capacity      int not null check (capacity > 0),
  booked_count  int not null default 0 check (booked_count >= 0),
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
  id                  uuid primary key,
  family_id           uuid not null references public.families(id) on delete restrict,
  type                public.payment_type not null,
  status              public.payment_status not null default 'pending',
  amount_cents        int not null check (amount_cents >= 0),
  gst_cents           int not null check (gst_cents >= 0),
  total_cents         int generated always as (amount_cents + gst_cents) stored,
  currency            char(3) not null default 'AUD',
  reference           text not null,
  term_label          text,
  child_id            uuid references public.children(id) on delete set null,
  class_session_id    uuid references public.class_sessions(id) on delete set null,
  details             jsonb not null default '{}'::jsonb,
  proof_path          text,
  proof_filename      text,
  proof_uploaded_at   timestamptz,
  submitted_by        uuid references public.profiles(id),
  recorded_by_admin   boolean not null default false,
  reviewed_by         uuid references public.profiles(id),
  reviewed_at         timestamptz,
  review_note         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (status <> 'pending' or proof_path is not null)
);
create index payments_family_idx on public.payments (family_id, created_at desc);
create index payments_pending_idx on public.payments (created_at) where status = 'pending';

-- ── Terms & credits ───────────────────────────────────────────────────────────
create table public.terms (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families(id) on delete restrict,
  status            public.term_status not null default 'active',
  term_label        text,
  start_date        date not null,
  end_date          date not null,
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
  hold_expires_at   timestamptz,
  credit_restored   boolean,
  cancelled_at      timestamptz,
  cancelled_by      uuid references public.profiles(id),
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (child_id, family_id) references public.children (id, family_id) on delete cascade,
  check (not credit_consumed or (source = 'term_credit' and term_id is not null))
);
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
  subjects      jsonb not null default '[]'::jsonb check (jsonb_typeof(subjects) = 'array'),
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

create table public.conversation_reads (
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
  action_url       text,
  data             jsonb not null default '{}'::jsonb,
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

create table public.user_devices (
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
