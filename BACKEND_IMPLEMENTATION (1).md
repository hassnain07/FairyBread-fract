# Fairybread & Fractions — Backend Implementation Guide

> **Backend:** Supabase (Postgres + Auth + Storage + Realtime + Edge Functions) · **Push:** Firebase Cloud Messaging (FCM HTTP v1) · **Clients:** this Vite/React web app now, a React Native app later.
> **Companion:** `SUPABASE_SCHEMA.md` (all SQL). Section references like "Schema §8" point there.
> **Also covers** `SHOP_AND_AUTH_UPDATES.md`: the Learning Shop (portal + public guest checkout) is in **§14**; the OTP signup / forgot-password flows are in **§4.4–4.5**.
> **Verification status:** the SQL and code in these two files were written against a full read of the repo but **have not been executed** (no Postgres/Supabase instance was available when they were authored). Treat running the migrations on a **dev** Supabase project through the SQL Editor, plus the checks in Schema §15 and the dashboard's Security Advisor, as the acceptance test, and expect to fix small typos on first run. **This guide assumes hosted Supabase only (Dashboard / SQL Editor) — no CLI, no Docker, no local stack.**

---

## Table of contents

1. [Architecture and the rules that keep the React Native app cheap later](#1-architecture)
2. [Setup: Supabase, env, client, generated types](#2-setup)
3. [Data layer: the new `DataClient` contract and its Supabase implementation](#3-data-layer)
4. [Auth: real sessions, role guards, **OTP** signup and password reset](#4-auth)
5. [Page-by-page frontend changes](#5-pages)
6. [Payments, proof upload and pricing](#6-payments)
7. [Edge Functions (`send-push`, `admin-invite-user`, `delete-account`; `shop-guest-checkout` in §14.4)](#7-edge-functions)
8. [FCM push notifications — end to end](#8-fcm)
9. [Realtime and in-app notifications](#9-realtime)
10. [Complete removal of the mock system](#10-mock-removal)
11. [Testing the frontend against the real schema](#11-testing)
12. [React Native readiness](#12-react-native)
13. [Go-live checklist](#13-go-live)
14. [**Learning Shop** (portal + public guest checkout)](#14-shop)

---

<a id="1-architecture"></a>
## 1. Architecture

```
 Web (Vite)  ─┐                                   ┌─ Postgres (RLS + RPC + triggers + pg_cron)
              ├─ supabase-js ── HTTPS ──► Supabase├─ Auth (email/password, JWT)
 RN app      ─┘  (anon key + user JWT)            ├─ Storage (payment-proofs, documents)
   ▲                                               ├─ Realtime (notifications, messages)
   │ FCM push                                      └─ Edge Functions ── service role ──► FCM HTTP v1
   └──────────────────────────────────────────────────────────────────────────────────────┘
        DB trigger (pg_net) → send-push → FCM → browser service worker / iOS / Android
```

**Principles (these are the source of "secure, scalable, reliable"):**

| Principle | Concretely |
|---|---|
| The browser is untrusted | Prices, credits, capacity, roles and the 24-hour rule are decided in Postgres. The client only displays results. |
| Reads via tables/views + RLS; writes that touch money/credits/seats via RPC only | The client has **no** `INSERT/UPDATE` grant on `payments`, `terms`, `class_bookings`, `class_sessions`, `messages`, `attendance` (Schema §11). |
| One data layer | Components → hooks → `dataClient` → `supabase`. `supabase.from()` appears **only** under `src/lib/data/supabase/`. (`rules.md` golden rule 2 stays true.) |
| Idempotent writes | Payments use a client-generated UUID as primary key; a network retry returns the same row. |
| Push is a side-effect of a DB row | Any code path that calls `private.notify*()` gets in-app + push for free, on web and mobile. |

### 1.1 What stays and what changes in the existing architecture

| Existing piece | Fate |
|---|---|
| `DataClient` interface (`lib/data/types.ts`) | **Kept as the seam**, but reshaped (§3.1) — IDs are UUID strings, money is cents, bookings reference a dated session. |
| `lib/data/mock/*` | **Deleted** (§10). |
| `lib/data/supabase/client.ts` (throwing stub) | **Replaced** by per-domain files (§3.3). |
| `lib/data/client.ts` (`VITE_DATA_SOURCE` switch) | **Simplified** to export the Supabase client only. |
| `lib/utils/termUtils.ts` | **Kept** — still the single UI source for gating (the server re-checks on every booking). |
| `lib/config.ts` | **Shrunk** — prices, GST, credits, weeks, cancellation window move to `app_settings` (Schema §5), read through `useAppSettings()`. |
| React Query | **Kept**, with a central key factory (§3.5). |
| `zustand`, `react-hook-form`, `zod` | Already installed. Use `zod` for the new forms (rules.md §2). |

### 1.2 Only one new dependency

`firebase` (web push, §8). Per `rules.md` §3 ("Ask first: adding any dependency"), **get approval for `firebase` before installing.** Everything else (`@supabase/supabase-js`, `@tanstack/react-query`, `zod`) is already in `package.json`.

---

<a id="2-setup"></a>
## 2. Setup

### 2.1 Projects, repo layout and the migration workflow (hosted Supabase — no Docker, no CLI)

You work entirely in the **Supabase Dashboard**. Nothing in this guide requires the Supabase CLI, Docker or a local stack. (Dashboard menu names move between releases; if a name below differs, search the matching section — Auth, Database, Edge Functions, Project Settings — for the setting.)

**Projects**

| Project | Purpose | Seed data? |
|---|---|---|
| `fairybread-dev` | all development, QA and experiments; the frontend's `.env.local` points here | **Yes** (Schema §14) |
| `fairybread-prod` | real families; create it when you're ready to launch | **Never** |

Pick the **Sydney (ap-southeast-2)** region for both (latency + keeping Australian family data in Australia). Free-plan projects are paused after about a week of inactivity (resume from the dashboard) and have tight email limits; use a paid plan for prod. If you only create one project for now, develop and seed in it, then run the reset in Schema §14.1 and delete every demo account before launch — a separate prod project is still strongly recommended.

**Repo layout (version control only — no tool reads these files; you paste them into the dashboard)**

```
supabase/
  migrations/0001_foundation.sql … 0011_cron.sql, 0012a_shop_enums.sql, 0012b_shop.sql, 0013_auth_otp_hygiene.sql
  seed.sql            # dev project only (Schema §14)
  dev_reset.sql       # dev project only (Schema §14.1)
  functions/send-push/index.ts, admin-invite-user/index.ts, delete-account/index.ts, shop-guest-checkout/index.ts
  templates/otp.html  # the OTP email body (§4.5.1)
  MIGRATIONS_LOG.md   # one line per applied migration: file · project · date · who
```

**Applying a migration (every time, in this order: 0001 → 0011 → 0012a → 0012b → 0013)**

1. Dashboard → **SQL Editor → New query**.
2. Paste the whole file. Put `begin;` on the first line and `commit;` on the last, so the file is **all-or-nothing** (exception: run `0012a` as-is; it is four independent, re-runnable statements).
3. Click inside the editor so **nothing is highlighted** — the editor runs only the selected text if there is a selection.
4. Run. Expect "Success. No rows returned". If it errors, nothing from that file was committed; fix the file in the repo and run it again. (Without the `begin/commit` wrapper a half-applied file is possible, and `create type` / `create table` are not re-runnable.)
5. Add a line to `MIGRATIONS_LOG.md`.
6. **Never edit an applied migration.** Any later change is a new file (`0014_…`) applied the same way, first on dev, then on prod.

**One-time dashboard setup (do on dev now; repeat on prod at launch)**

| # | Where | What |
|---|---|---|
| 1 | Database → Extensions | Enable `pg_cron`, `pg_net`, `btree_gist` (migration 0001 also runs `create extension`; enabling them here first avoids permission surprises) |
| 2 | SQL Editor | Run the migrations (above) |
| 3 | Project Settings → API (Data API) | **Exposed schemas = `public` (and `graphql_public`) only.** `private` must **not** be listed — it holds the security-definer helpers |
| 4 | Auth → URL Configuration | Site URL `http://localhost:5173` (dev) / your real origin (prod). Redirect URLs: `<origin>/login`, `<origin>/reset-password` |
| 5 | Auth → Sign In / Providers → Email | **Confirm email ON**, **OTP length 6**, **OTP expiry 600 s**; password minimum length 8 |
| 6 | Auth → SMTP Settings | Configure **custom SMTP** (Resend, Postmark, SES…) — see the warning below |
| 7 | Auth → Email Templates | Paste `templates/otp.html` into **Confirm signup**, **Magic Link** and **Reset Password** (all must print `{{ .Token }}`, §4.5.1). Leave **Invite** link-based |
| 8 | Auth → Rate Limits | Raise "emails sent per hour" while you test (keep sensible values in prod) |
| 9 | SQL Editor | Create the two Vault secrets (Schema §13.1) using the **hosted** function URL |
| 10 | Edge Functions | Deploy the four functions and add their secrets (§7) |
| 11 | SQL Editor | Run `seed.sql` (dev only) |
| 12 | Project Settings → API | Copy the **Project URL** and the **anon / publishable key** into `.env.local` (§2.2). Never copy the `service_role` / secret key into the frontend |
| 13 | Advisors → Security (and Performance) | Review every finding. The schema is built so there are no "RLS disabled" or "exposed schema" errors |
| 14 | SQL Editor | Run the invariant queries in Schema §15.1 and the RLS smoke tests in §15.2 |

> ⚠️ **Email is real from day one.** Supabase's built-in email sender is for evaluation only: it currently delivers just to addresses belonging to your organisation's team members and allows only a few emails per hour. OTP signup for anyone else would silently never receive its code. Configure custom SMTP (step 6) **before** testing signup with real parents. For your own testing use plus-addresses (`you+parent1@gmail.com`, `you+parent2@gmail.com`) — they all land in one inbox.

**TypeScript types for the database (optional, not required to compile).** The app's own types in `src/types/*` already describe every shape the UI uses. If you want generated types as well, either use the type generator in the dashboard's Database / API-docs area, or run one command from your machine (needs only a login token, **no Docker**):
`npx supabase gen types typescript --project-id <your-project-ref> > src/lib/data/supabase/database.types.ts`. Until then keep the placeholder `export type Database = any;` in `database.types.ts`.

**Security of the dashboard itself:** anyone with dashboard access can read every family's data. Turn on 2-factor authentication for every member of the Supabase organisation and keep the member list minimal.

### 2.2 Environment variables

`.env.example` (commit) / `.env.local` (git-ignored — add `.env` and `.env.*.local` to `.gitignore`, `phases.md` 0.5):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co      # Project Settings → API (the DEV project while developing)
VITE_SUPABASE_ANON_KEY=<anon / publishable key>          # never the service_role / secret key

# Firebase Web App config (public by design — NOT secrets)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=            # Web Push certificate (public key)

# Optional: Cloudflare Turnstile site key (public) for guest checkout; its secret lives only in the Edge function
VITE_TURNSTILE_SITE_KEY=
```

Remove `VITE_DATA_SOURCE` entirely (§10). **Never** put the `service_role` key, the Firebase service-account JSON or `PUSH_WEBHOOK_SECRET` in any `VITE_*` variable — anything prefixed `VITE_` is shipped to every browser.

### 2.3 The Supabase client (`src/lib/supabase.ts`)

This is the **only** file that reads `import.meta.env` for backend config. It takes its inputs from a factory so the React Native app can reuse everything else with its own storage adapter (§12).

```ts
// src/lib/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './data/supabase/database.types';

export type AppSupabase = SupabaseClient<Database>;

export function createAppSupabase(url: string, anonKey: string, opts?: {
  storage?: unknown;               // RN: AsyncStorage
  detectSessionInUrl?: boolean;    // web: true, RN: false
}): AppSupabase {
  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: opts?.detectSessionInUrl ?? true,
      ...(opts?.storage ? { storage: opts.storage as never } : {}),
    },
  });
}

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');

export const supabase = createAppSupabase(url, key);
```

### 2.4 Production project — extra settings (when you create `fairybread-prod`)

| Setting | Value |
|---|---|
| Plan | Paid plan: no project pausing, daily backups, higher email limits |
| Database → Backups | **Point-in-Time Recovery** on (payments and signed consents are records you may need) |
| Auth → URL configuration | Site URL = production origin only; remove every `localhost` redirect; later add the mobile scheme `fairybread://auth/callback` |
| Auth → Passwords | Minimum length 8; turn on **leaked-password protection** if your plan offers it |
| Auth → Bot and abuse protection | Turnstile / hCaptcha on sign-up (and on guest checkout, §14.4) |
| Auth → SMTP | Your own domain with SPF/DKIM so OTP emails reach inboxes |
| Edge secrets | Different values from dev (`PUSH_WEBHOOK_SECRET`, `IP_HASH_SALT`, Firebase **prod** service account, `APP_URL` = production origin) |
| Organisation | 2FA for every member; least-privilege roles |
| Seed | **Do not run.** Promote the first admin manually (Schema §7 note) |

---

<a id="3-data-layer"></a>
## 3. Data layer

### 3.1 New `DataClient` contract (replaces `src/lib/data/types.ts`)

Changes versus today, and why:

| Change | Reason |
|---|---|
| All IDs stay `string` (now UUIDs) | No type churn. Never parse meaning from an ID. |
| Money fields renamed `*_cents` (integers) | No float drift; display with `formatMoney()` (§6.3). |
| `ClassInstance` splits into **`ClassSlot`** (recurring, from `v_class_catalog`) and **`ClassSession`** (dated, bookable) | Capacity, the 24h rule and attendance all need a date. |
| `createBooking(...)` → `bookClassSession(childId, sessionId)` | The server decides credit, capacity, family; the client cannot forge them. |
| `submitPayment(...)` takes a `File`, an `id`, and a typed intent | Upload + RPC happen together (§6). |
| `uploadPaymentProof`, `createIndividualPurchase`, `getPendingPayments` removed | Folded into `submitPayment` / server-side `verify_payment` / `getAllPayments({status})`. |
| New admin "all" reads | Kills every `ALL_FAMILY_IDS` loop (`phases.md` 1.6). |
| Auth methods live on the client | `signIn / requestSignupOtp / requestPasswordResetOtp / verifyOtp / setPassword / signOut / getMyContext` (OTP flows, §4.4–4.5) |

```ts
// src/lib/data/types.ts  (v2)
import type { Family, Child, ChildPatch, NewChild, EnrolmentInput } from '../../types/family';
import type { Term } from '../../types/term';
import type { ClassBooking, BookingCancelResult, Assessment, StudentReport, NewReport, AttendanceRecord } from '../../types/booking';
import type { Payment, PaymentIntent, PriceQuote, GatingSnapshot } from '../../types/payment';
import type { Teacher, ClassSlot, ClassSession, ClassSlotInput, Program } from '../../types/teacher';
import type { Conversation, ChatMessage, AppNotification, NotificationCategory, ConversationKind } from '../../types/message';
import type { AppSettings, FamilySummary, AdminStats, DocumentMap } from '../../types/admin';
import type { AuthUser } from '../../types/auth';
import type { ShopProduct, ShopOrder, PlaceOrderInput, PlacedOrder, ShopStats, AdminShopProduct, ShopProductInput } from '../../types/shop';

export interface DataClient {
  // ── Auth ───────────────────────────────────────────────
  signIn(email: string, password: string): Promise<AuthUser>;
  requestSignupOtp(input: { email: string; firstName: string; lastName: string; phone?: string }): Promise<void>;
  requestPasswordResetOtp(email: string): Promise<void>;                       // never reveals whether the email exists
  verifyOtp(email: string, code: string, purpose: 'signup' | 'recovery'): Promise<void>;   // creates a session; throws AppError('otp_invalid')
  setPassword(newPassword: string): Promise<void>;                              // needs the session created by verifyOtp
  signOut(): Promise<void>;
  getMyContext(): Promise<AuthUser | null>;
  onAuthChange(cb: (event: 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY' | 'TOKEN_REFRESHED') => void): () => void;

  // ── Settings / content ────────────────────────────────
  getSettings(): Promise<AppSettings>;
  updateSetting(key: keyof AppSettings, value: unknown): Promise<void>;
  getDocuments(): Promise<DocumentMap>;                              // key → public URL
  uploadDocument(key: string, file: File): Promise<string>;

  // ── Families & children ───────────────────────────────
  getFamily(familyId: string): Promise<Family>;
  getAllFamilies(): Promise<FamilySummary[]>;                        // admin
  createFamily(input: { parentName: string; email?: string; phone?: string }): Promise<Family>;   // admin
  updateFamily(familyId: string, patch: Partial<Pick<Family, 'parent_name' | 'phone' | 'address'>>): Promise<Family>;
  getChildren(familyId: string): Promise<Child[]>;
  getAllChildren(): Promise<Child[]>;                                // admin
  addChild(familyId: string, child: NewChild): Promise<Child>;
  updateChild(childId: string, patch: ChildPatch): Promise<Child>;
  completeEnrolment(childId: string, input: EnrolmentInput): Promise<Child>;
  adminMarkEnrolled(childId: string, note?: string): Promise<Child>;      // admin: paper/phone enrolment

  // ── Terms & gating ────────────────────────────────────
  getTerms(familyId: string): Promise<Term[]>;
  getAllTerms(): Promise<Term[]>;                                    // admin
  getGating(familyId: string): Promise<GatingSnapshot>;              // server-authoritative (used by admin family-booking)
  adminAdjustCredits(termId: string, delta: number, note: string): Promise<Term>;

  // ── Catalog & sessions ────────────────────────────────
  getPrograms(): Promise<Program[]>;
  upsertProgram(p: { id?: string; name: string; description?: string; color?: string; is_active?: boolean }): Promise<Program>;
  getTeachers(): Promise<Teacher[]>;
  getClassSlots(): Promise<ClassSlot[]>;                             // v_class_catalog (price only for admin/owner)
  createClassSlot(input: ClassSlotInput): Promise<ClassSlot>;
  updateClassSlot(id: string, patch: Partial<ClassSlotInput>): Promise<ClassSlot>;
  deactivateClassSlot(id: string, cancelFuture?: boolean): Promise<number>;
  getUpcomingSessions(opts?: { from?: string; to?: string; classId?: string; teacherId?: string }): Promise<ClassSession[]>;
  cancelSession(sessionId: string, reason?: string): Promise<number>;

  // ── Bookings ──────────────────────────────────────────
  getBookings(familyId: string): Promise<ClassBooking[]>;
  getAllBookings(): Promise<ClassBooking[]>;                         // admin
  getBookingsForTeacher(): Promise<ClassBooking[]>;                  // RLS limits to the caller's classes
  bookClassSession(childId: string, sessionId: string): Promise<ClassBooking>;
  joinWaitlist(childId: string, sessionId: string): Promise<ClassBooking>;
  cancelBooking(bookingId: string, opts?: { restoreCredit?: boolean }): Promise<BookingCancelResult>;
  getWaitingList(): Promise<ClassBooking[]>;                         // admin

  // ── Payments ──────────────────────────────────────────
  getPriceQuote(type: Payment['type'], familyId: string): Promise<PriceQuote>;
  getPayments(familyId: string): Promise<Payment[]>;
  getAllPayments(opts?: { status?: Payment['status'] }): Promise<Payment[]>;       // admin
  submitPayment(intent: PaymentIntent, proof: File): Promise<Payment>;
  getProofUrl(paymentId: string): Promise<string>;                                  // short-lived signed URL
  verifyPayment(paymentId: string, action: 'approve' | 'reject', note?: string): Promise<Payment>;   // admin
  adminRecordPayment(input: { familyId: string; type: 'term' | 'individual_class'; childId?: string; sessionId?: string; note?: string }): Promise<Payment>;

  // ── Assessments / reports / attendance ────────────────
  getAssessments(familyId: string): Promise<Assessment[]>;
  getTeacherAssessments(): Promise<Assessment[]>;                    // RLS: caller's own
  createTeacherAssessments(rows: Array<{ childId: string; classId?: string; date: string; time: string }>): Promise<Assessment[]>;
  updateAssessment(id: string, patch: Partial<Pick<Assessment, 'status' | 'scheduled_date' | 'scheduled_time' | 'notes'>>): Promise<Assessment>;
  getReportsForChild(childId: string): Promise<StudentReport[]>;     // parent: published only (RLS)
  getTeacherReports(): Promise<StudentReport[]>;
  createReport(report: NewReport): Promise<StudentReport>;
  getAttendance(sessionId: string): Promise<AttendanceRecord[]>;
  getChildAttendance(childId: string): Promise<AttendanceRecord[]>;
  saveAttendance(sessionId: string, records: Array<{ childId: string; status: AttendanceRecord['status'] }>): Promise<number>;

  // ── Messaging ─────────────────────────────────────────
  getConversations(): Promise<Conversation[]>;                       // scoped by RLS/RPC to the caller
  startConversation(kind: ConversationKind, target: { familyId?: string; teacherId?: string }): Promise<string>;
  getMessages(conversationId: string): Promise<ChatMessage[]>;
  sendMessage(conversationId: string, body: string): Promise<ChatMessage>;
  markConversationRead(conversationId: string): Promise<void>;

  // ── Notifications & devices ───────────────────────────
  getNotifications(limit?: number): Promise<AppNotification[]>;      // caller's own — no familyId/teacherId args any more
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  getNotificationPrefs(): Promise<Record<NotificationCategory, { push: boolean; inApp: boolean }>>;
  setNotificationPref(category: NotificationCategory, v: { push?: boolean; inApp?: boolean }): Promise<void>;
  registerDevice(token: string, platform: 'web' | 'ios' | 'android', meta?: { appVersion?: string; locale?: string }): Promise<void>;
  unregisterDevice(token: string): Promise<void>;

  // ── Learning Shop (details & implementation: §14) ─────
  getShopProducts(): Promise<ShopProduct[]>;                                   // callable signed-out
  getShopOrders(familyId: string): Promise<ShopOrder[]>;
  getAllShopOrders(opts?: { limit?: number; offset?: number }): Promise<ShopOrder[]>;
  getShopStats(): Promise<ShopStats>;
  placeOrder(input: PlaceOrderInput): Promise<PlacedOrder>;                    // portal → RPC; guest → Edge Function
  verifyShopOrder(orderId: string, action: 'approve' | 'reject', note?: string): Promise<void>;
  updateShopOrderStatus(orderId: string, status: ShopOrder['status'], note?: string): Promise<void>;
  getShopReceiptUrl(orderId: string): Promise<string | null>;
  getAdminShopProducts(): Promise<AdminShopProduct[]>;
  upsertShopProduct(p: ShopProductInput): Promise<AdminShopProduct>;
  uploadShopProductImage(productId: string, file: File): Promise<string>;

  // ── Admin ─────────────────────────────────────────────
  getAdminStats(): Promise<AdminStats>;
  inviteStaff(input: { email: string; fullName: string; role: 'teacher' | 'admin'; subjects?: string[]; color?: string }): Promise<void>;
  deleteMyAccount(): Promise<void>;
}
```

> `getNotifications()` no longer takes `familyId`/`teacherId`: notifications belong to a **profile** (`recipient_id = auth.uid()`), which also fixes the old mock ambiguity where admin had no notification audience.

### 3.2 Type changes (`src/types/*`)

Keep file names; change shapes **additively** where the UI already reads a field, so pages need minimal edits.

```ts
// types/auth.ts   (new — also fixes the circular Role import, phases.md 0.9)
export type Role = 'parent' | 'teacher' | 'admin';
export interface AuthUser {
  id: string; email: string; fullName: string; firstName: string;
  role: Role; familyId: string | null; teacherId: string | null;
}

// types/family.ts
export type Child = {
  id: string; family_id: string;
  name: string; initials: string;               // generated columns
  givenName: string; familyName: string; preferredName?: string;
  year: string; school: string;                 // ← year_level / school
  enrolled: boolean;                            // ← enrolled_at != null
  concern?: string; subjects?: string[]; preferredDays?: string[];
  goals?: string; notes?: string; preferredTutor?: string; sessions?: string;
};
export type NewChild   = { givenName: string; familyName: string; year: string; school?: string };
export type ChildPatch = Partial<Pick<Child, 'givenName'|'familyName'|'preferredName'|'year'|'school'|'concern'|'subjects'|'preferredDays'|'goals'|'notes'>>;
export type Family = { id: string; reference_code: string; parent_name: string; email?: string; phone?: string; children?: Child[] };

// types/term.ts  — Term keeps its fields; money removed; payment_id instead of embedded payment
export type Term = {
  id: string; family_id: string; status: TermStatus; term_label?: string;
  start_date: string; end_date: string;         // end exclusive
  classes_included: number; classes_booked: number; classes_remaining: number;
};

// types/teacher.ts
export type Teacher = { id: string; name: string; initials: string; subjects: string[]; color: string };
export type ClassSlot = {
  id: string; subject: string; program_id: string; teacher_id: string; teacher_name: string; teacher_color: string;
  day_of_week: number;                          // ISO 1–7
  start_time: string; duration_minutes: number; capacity: number; is_active: boolean;
  next_session_id?: string; next_session_at?: string; next_booked_count: number;
  price_cents?: number;                         // only present for admin / owning teacher
};
export type ClassSession = {
  id: string; class_id: string; starts_at: string; ends_at: string;
  capacity: number; booked_count: number; status: 'scheduled' | 'cancelled' | 'completed';
  spaces_left: number;                          // derived: capacity - booked_count
  subject: string; teacher_id: string; teacher_name: string; teacher_color: string; program_color: string;
};

// types/booking.ts
export type ClassBooking = {
  id: string; family_id: string; child_id: string; class_session_id: string;
  source: 'term_credit' | 'individual_purchase';
  status: 'confirmed' | 'waiting_list' | 'pending_payment' | 'cancelled';
  credit_consumed: boolean; credit_restored?: boolean; hold_expires_at?: string;
  session?: ClassSession;                       // joined for display
  child?: Pick<Child, 'id' | 'name' | 'initials'>;
};
export type BookingCancelResult = { credit_restored: boolean; within_window: boolean };
export type Assessment = {
  id: string; family_id: string; child_id: string; teacher_id?: string; class_id?: string;
  scheduled_date?: string; scheduled_time?: string;
  status: 'awaiting_payment' | 'scheduled' | 'completed' | 'cancelled'; payment_id?: string; notes?: string;
};
export type StudentReport = { id: string; child_id: string; teacher_id: string; term: string; overall: 1|2|3|4|5;
  subjects: SubjectRating[]; strengths: string; areas: string; note: string; created_at: string };
export type AttendanceRecord = { class_session_id: string; child_id: string; status: 'present' | 'absent' | 'no_show' | 'late' };

// types/payment.ts
export type PaymentType = 'term' | 'individual_class' | 'assessment';           // + 'assessment'  (phases.md 1.5)
export type Payment = {
  id: string; family_id: string; family_name?: string; type: PaymentType; status: 'pending'|'paid'|'rejected'|'failed';
  amount_cents: number; gst_cents: number; total_cents: number; reference: string; term_label?: string;
  proof_filename?: string; details: { child_name?: string; subject?: string; day?: string; time?: string; tutor?: string };
  review_note?: string; created_at: string;
};
export type PaymentIntent =
  | { type: 'term'; familyId: string }
  | { type: 'individual_class'; familyId: string; childId: string; sessionId: string }
  | { type: 'assessment'; familyId: string; childId: string; date: string; time: string };
export type PriceQuote = { base_cents: number; registration_cents: number; amount_cents: number; gst_cents: number; total_cents: number };
export type GatingSnapshot = { state: 'NO_TERM_EVER'|'ACTIVE_TERM'|'TERM_EXPIRED'; active_term_id?: string; classes_remaining: number; end_date?: string };

// types/message.ts
export type NotificationType = /* the 14 values of the notification_type enum, Schema §3 */ string;
export type NotificationCategory = 'new_bookings'|'cancellations'|'payments'|'reports'|'reminders'|'messages'|'announcements';
export interface AppNotification {
  id: string; type: NotificationType; title: string; body: string; read: boolean; created_at: string;
  action_url?: string; data: Record<string, unknown>;
}
export interface Conversation {
  id: string; kind: ConversationKind; title: string;       // the *other* party's name, built by the mapper
  last_message: string; last_message_at: string; unread_count: number; avatar_color: string;
  family_id?: string; teacher_id?: string;
}
export type ConversationKind = 'parent_staff' | 'parent_teacher' | 'teacher_staff';
```

### 3.3 Folder layout for the Supabase implementation

```
src/lib/
  supabase.ts                       # client factory (§2.3)
  data/
    client.ts                       # export const dataClient: DataClient = createSupabaseDataClient(supabase)
    types.ts                        # contract (§3.1)
    errors.ts                       # AppError + code → friendly text (§3.4)
    queryKeys.ts                    # key factory + invalidation sets (§3.5)
    supabase/
      database.types.ts             # generated
      index.ts                      # createSupabaseDataClient(sb) → composes the files below
      auth.ts  settings.ts  families.ts  terms.ts  catalog.ts  bookings.ts
      payments.ts  assessments.ts  reports.ts  attendance.ts  messaging.ts  notifications.ts  admin.ts  shop.ts
      mappers.ts                    # row → app type (Child, ClassSession, Payment …)
      rpc.ts                        # thin typed wrapper: await rpc('book_class_session', {...}) → throws AppError
```

`client.ts` becomes:

```ts
import { supabase } from '../supabase';
import { createSupabaseDataClient } from './supabase';
export const dataClient = createSupabaseDataClient(supabase);
```

### 3.4 Errors: one place, friendly copy, no stack traces (`rules.md` §5)

PostgREST returns RPC `raise exception 'no_credits'` as `error.message === 'no_credits'`. Map every code in Schema §8's error contract:

```ts
// src/lib/data/errors.ts
export class AppError extends Error {
  constructor(public code: string, message: string, public cause?: unknown) { super(message); }
}

const COPY: Record<string, string> = {
  not_authenticated: 'Please sign in again.',
  forbidden: 'You don’t have permission to do that.',
  child_not_found: 'We couldn’t find that child.',
  child_not_enrolled: 'Please complete enrolment for this child first.',
  session_unavailable: 'That class is no longer available.',
  session_started: 'That class has already started.',
  session_outside_term: 'That class falls after your term ends. You can book it as an individual class.',
  no_term_ever: 'Purchase a term to unlock class bookings.',
  term_expired: 'Your term has ended. Renew to book with credits.',
  no_credits: 'You’ve used all your credits for this term.',
  class_full: 'Sorry, that class just filled up. You can join the waiting list.',
  already_booked: 'This child is already booked into that class.',
  booking_not_found: 'We couldn’t find that booking.',
  already_cancelled: 'This booking was already cancelled.',
  payment_not_found: 'We couldn’t find that payment.',
  payment_not_pending: 'That payment has already been reviewed.',
  proof_missing: 'Please attach your proof of payment and try again.',
  consent_required: 'Please agree to all three documents to continue.',
  signature_required: 'Please type your full name as a signature.',
  seat_unavailable: 'That seat is no longer available — please contact the family.',
  class_has_bookings: 'This class has upcoming bookings. Cancel the sessions first.',
  invalid_input: 'Some of the details look wrong. Please check and try again.',
  invalid_message: 'Messages must be between 1 and 4000 characters.',
  // shop
  out_of_stock: 'Sorry — one or more items just sold out. Please review your cart.',
  product_unavailable: 'One of the items in your cart is no longer available.',
  payment_method_disabled: 'That payment method isn’t available right now.',
  guest_checkout_disabled: 'Guest checkout is currently unavailable. Please sign in to order.',
  captcha_failed: 'We couldn’t verify you’re human. Please try again.',
  order_not_found: 'We couldn’t find that order.',
  invalid_transition: 'That status change isn’t allowed from the current status.',
  payment_required: 'Verify the payment before moving this order to Processing.',
  // auth / OTP
  otp_invalid: 'That code is incorrect or has expired. Check it, or request a new one.',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  weak_password: 'Please choose a stronger password (at least 8 characters).',
};

export function toAppError(e: unknown): AppError {
  const err = e as { message?: string; code?: string; status?: number };
  const msg = err?.message ?? '';
  if (COPY[msg]) return new AppError(msg, COPY[msg], e);
  if (err?.code === '42501' || err?.status === 403) return new AppError('forbidden', COPY.forbidden, e);
  if (err?.code === '23505') return new AppError('duplicate', 'That already exists.', e);
  if (/Invalid login credentials/i.test(msg)) return new AppError('bad_login', 'Incorrect email or password. Please try again.', e);   // generic: never reveal if the email exists
  if (/Token has expired or is invalid|otp_expired|invalid.*(token|otp)/i.test(msg)) return new AppError('otp_invalid', COPY.otp_invalid, e);
  if (/rate limit|over_email_send_rate_limit|only request this after|too many requests/i.test(msg) || err?.status === 429) return new AppError('rate_limited', COPY.rate_limited, e);
  if (/Password should be|weak.password/i.test(msg)) return new AppError('weak_password', COPY.weak_password, e);
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return new AppError('network', 'We can’t reach the server. Check your connection and try again.', e);
  console.error('[data]', e);                                       // technical detail → console only
  return new AppError('unknown', 'Something went wrong. Please try again.', e);
}
```

Every data-layer method does `const { data, error } = await …; if (error) throw toAppError(error);`. Pages keep their existing `onError: (e: Error) => setError(e.message)` pattern and now get human text for free. **Rule:** components never show `error.message` from anything other than an `AppError`.

### 3.5 Query keys and invalidation (replaces the ad-hoc keys in `architecture.md` §4.2)

```ts
// src/lib/data/queryKeys.ts
export const qk = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  documents: ['documents'] as const,
  families: ['families'] as const,
  family: (id: string) => ['family', id] as const,
  children: (familyId: string) => ['children', familyId] as const,
  allChildren: ['children', 'all'] as const,
  terms: (familyId: string) => ['terms', familyId] as const,
  allTerms: ['terms', 'all'] as const,
  programs: ['programs'] as const,
  teachers: ['teachers'] as const,
  classSlots: ['classSlots'] as const,
  sessions: (f?: object) => ['sessions', f ?? {}] as const,
  bookings: (familyId: string) => ['bookings', familyId] as const,
  allBookings: ['bookings', 'all'] as const,
  teacherBookings: ['bookings', 'teacher'] as const,
  payments: (familyId: string) => ['payments', familyId] as const,
  allPayments: ['payments', 'all'] as const,
  quote: (type: string, familyId: string) => ['quote', type, familyId] as const,
  assessments: (familyId: string) => ['assessments', familyId] as const,
  teacherAssessments: ['assessments', 'teacher'] as const,
  reports: (childId: string) => ['reports', childId] as const,
  teacherReports: ['reports', 'teacher'] as const,
  attendance: (sessionId: string) => ['attendance', sessionId] as const,
  childAttendance: (childId: string) => ['attendance', 'child', childId] as const,
  conversations: ['conversations'] as const,
  messages: (convId: string) => ['messages', convId] as const,
  notifications: ['notifications'] as const,
  adminStats: ['adminStats'] as const,
  // shop (§14)
  shopProducts: ['shopProducts'] as const,
  shopOrders: (familyId: string) => ['shopOrders', familyId] as const,
  allShopOrders: (page = 0) => ['allShopOrders', page] as const,
  shopStats: ['shopStats'] as const,
  adminShopProducts: ['adminShopProducts'] as const,
};
```

**Invalidation sets** (every mutation invalidates every screen that shows the changed entity — `rules.md` §4):

| Mutation | Invalidate |
|---|---|
| `bookClassSession`, `joinWaitlist` | `bookings(family)`, `allBookings`, `teacherBookings`, `terms(family)`, `allTerms`, `sessions()`, `classSlots`, `notifications` |
| `cancelBooking` | same as above |
| `submitPayment` | `payments(family)`, `allPayments`, `bookings(family)` (seat hold), `assessments(family)`, `sessions()`, `adminStats` |
| `verifyPayment`, `adminRecordPayment` | `allPayments`, `payments(family)`, `terms(family)`, `allTerms`, `bookings(family)`, `allBookings`, `assessments(family)`, `adminStats`, `notifications` |
| `completeEnrolment`, `updateChild`, `addChild` | `children(family)`, `allChildren`, `families` |
| `saveAttendance` | `attendance(session)`, `childAttendance(child)` |
| `createReport` | `teacherReports`, `reports(child)` |
| `sendMessage` | `messages(conv)`, `conversations` |
| `create/update/deactivateClassSlot`, `cancelSession` | `classSlots`, `sessions()`, `allBookings`, `teacherBookings` |
| `placeOrder` | `shopOrders(family)`, `shopProducts`, `adminShopProducts`, `shopStats`, `notifications` |
| `verifyShopOrder`, `updateShopOrderStatus` | `allShopOrders`, `shopOrders` (prefix), `shopStats`, `notifications` |
| `upsertShopProduct`, `uploadShopProductImage` | `shopProducts`, `adminShopProducts` |

### 3.6 The RPC wrapper and mappers (shows the pattern for every file)

```ts
// src/lib/data/supabase/rpc.ts
import type { AppSupabase } from '../../supabase';
import { toAppError } from '../errors';

export async function rpc<T>(sb: AppSupabase, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn as never, args as never);
  if (error) throw toAppError(error);
  return data as T;
}
```

```ts
// src/lib/data/supabase/mappers.ts  (excerpt)
import type { Child } from '../../../types/family';
export const toChild = (r: any): Child => ({
  id: r.id, family_id: r.family_id, name: r.name, initials: r.initials,
  givenName: r.given_name, familyName: r.family_name, preferredName: r.preferred_name ?? undefined,
  year: r.year_level ?? '', school: r.school ?? '', enrolled: !!r.enrolled_at,
  concern: r.concern ?? undefined, subjects: r.subjects ?? [], preferredDays: r.preferred_days ?? [],
  goals: r.goals ?? undefined, notes: r.notes ?? undefined,
  preferredTutor: r.preferred_teacher?.name, sessions: r.sessions_per_week ?? undefined,
});
```

### 3.7 Method → Supabase call map (implement exactly this)

| `DataClient` method | Supabase call |
|---|---|
| `signIn` | `auth.signInWithPassword` → `rpc get_my_context` → `AuthUser` |
| `requestSignupOtp` | `auth.signInWithOtp({ email, options: { shouldCreateUser: true, data: { first_name, last_name, phone } } })`. DB trigger builds profile + family (§4.4) |
| `verifyOtp` | `auth.verifyOtp({ email, token, type: purpose === 'signup' ? 'email' : 'recovery' })` → session; map failures to `otp_invalid` |
| `setPassword` | `auth.updateUser({ password })` |
| `signOut` | `unregisterDevice(currentToken)` (§8.5) then `auth.signOut()` |
| `requestPasswordResetOtp` | `auth.resetPasswordForEmail(email)` — always resolve OK (never reveal whether the email exists); the Reset Password template carries `{{ .Token }}` (§4.5.1) |
| `getMyContext` | `rpc get_my_context` |
| `getSettings` | `from('app_settings').select('key,value')` → object |
| `updateSetting` | `from('app_settings').update({ value, updated_by, updated_at }).eq('key', key)` (admin; RLS) |
| `getDocuments` | `from('documents').select('key,storage_path,version')` → `storage.from('documents').getPublicUrl(path)` + `?v=version` |
| `uploadDocument` | `storage.from('documents').upload('{key}/v{n}.pdf', file, { contentType:'application/pdf' })` then upsert `documents` row with `version = old+1`. Old versions are kept (consent evidence refers to the version signed) |
| `getFamily` | `from('families').select('*, children(*)').eq('id', id).single()` |
| `getAllFamilies` | `from('v_family_summary').select('*')` |
| `createFamily` | `rpc admin_create_family` |
| `getChildren` | `from('children').select('*, preferred_teacher:teachers(name)').eq('family_id', id).is('archived_at', null).order('created_at')` |
| `getAllChildren` | same without the family filter (admin RLS) |
| `addChild` | `from('children').insert({ family_id, given_name, family_name, year_level, school }).select().single()` |
| `updateChild` | `from('children').update(snakeCase(patch)).eq('id', id).select().single()` — **fixes the enrolment-duplicates-child bug** (`phases.md` 1.2). Column grants (Schema §11) stop callers from touching `enrolled_at`/`family_id` |
| `adminMarkEnrolled` | `rpc admin_mark_enrolled({ p_child_id, p_note })` |
| `completeEnrolment` | `rpc complete_enrolment({ p_child_id, p_child, p_parent, p_referral, p_signature, p_agreed_* })` |
| `getTerms` / `getAllTerms` | `from('terms').select('*').eq('family_id', id).order('start_date')` |
| `getGating` | `rpc get_family_gating` |
| `adminAdjustCredits` | `rpc admin_adjust_credits` |
| `getPrograms` / `upsertProgram` | `from('programs')` select / upsert (admin) |
| `getTeachers` | `from('teachers').select('id,name,initials,subjects,color').eq('is_active', true)` |
| `getClassSlots` | `from('v_class_catalog').select('*').eq('is_active', true)`; for admin/teacher also `from('class_rates').select('class_id,price_cents')` and merge (RLS returns nothing to parents) |
| `createClassSlot` | `insert classes` → `upsert class_rates` (price) → DB trigger generates sessions |
| `updateClassSlot` | `update classes` (+ `upsert class_rates`) — trigger regenerates empty future sessions |
| `deactivateClassSlot` | `rpc deactivate_class` (**never** `delete` on `classes`) |
| `getUpcomingSessions` | `from('class_sessions').select('*, class:classes(teacher_id, program:programs(name,color), teacher:teachers(name,color))').eq('status','scheduled').gte('starts_at', from ?? now).lt('starts_at', to).order('starts_at')` → map `spaces_left` |
| `cancelSession` | `rpc cancel_session` |
| `getBookings` | `from('class_bookings').select('*, child:children(id,name,initials), session:class_sessions(*, class:classes(program:programs(name,color), teacher:teachers(name,color)))').eq('family_id', id).neq('status','cancelled')` (also fetch cancelled for history if the UI shows them) |
| `getAllBookings` / `getBookingsForTeacher` | same select without the family filter — RLS narrows to all (admin) or the caller's classes (teacher) |
| `bookClassSession` | `rpc book_class_session({ p_child_id, p_session_id })` |
| `joinWaitlist` | `rpc join_waitlist` |
| `cancelBooking` | `rpc cancel_booking({ p_booking_id, p_restore_credit })` → `{ credit_restored, within_window }` |
| `getWaitingList` | `from('class_bookings').select('*, child:children(name), session:class_sessions(...)').eq('status','waiting_list')` |
| `getPriceQuote` | `rpc quote_price` |
| `getPayments` / `getAllPayments` | `from('payments').select('*, family:families(parent_name)')` (+ filters) |
| `submitPayment` | §6.2 |
| `getProofUrl` | `storage.from('payment-proofs').createSignedUrl(path, 300)` |
| `verifyPayment` | `rpc verify_payment` |
| `adminRecordPayment` | `rpc admin_record_payment` |
| `getAssessments` / `getTeacherAssessments` | `from('assessments').select('*, child:children(name)')` — RLS does the scoping |
| `createTeacherAssessments` | `from('assessments').insert(rows.map(...))` — RLS `teacher_has_child` rejects students the teacher doesn't teach |
| `getReportsForChild` | `from('student_reports').select('*').eq('child_id', id).order('created_at')` — **replaces the loop over all teachers** in `ReportsPage` |
| `createReport` | `insert student_reports` (unique `(child, teacher, term)` → friendly "already written" error); DB trigger notifies the family |
| `getAttendance` / `getChildAttendance` | `from('attendance').select('*, session:class_sessions(starts_at, class:classes(program:programs(name)))')` |
| `saveAttendance` | `rpc save_attendance({ p_session_id, p_records })` |
| `getConversations` | `rpc get_conversations` → map to `Conversation` (title = counterpart's name; avatar colour derived from a stable hash) |
| `startConversation` | `rpc start_conversation` |
| `getMessages` | `from('messages').select('*').eq('conversation_id', id).order('created_at')` |
| `sendMessage` | `rpc send_message` — **sender name/role are derived server-side**; the client no longer sends `sender_name: 'Sarah Johnson'` |
| `markConversationRead` | `rpc mark_conversation_read` |
| `getNotifications` | `from('notifications').select('*').order('created_at', { ascending:false }).limit(limit ?? 50)` |
| `markNotificationRead` | `from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)` |
| `markAllNotificationsRead` | `rpc mark_all_notifications_read` |
| `get/setNotificationPref` | `from('notification_preferences')` select / upsert `{ profile_id, category, push_enabled, in_app_enabled }` |
| `registerDevice` / `unregisterDevice` | `rpc register_device` / `rpc unregister_device` |
| `getAdminStats` | `rpc admin_dashboard_stats` |
| `getShopProducts` … `uploadShopProductImage` | see the table in §14.3 |
| `inviteStaff` | `functions.invoke('admin-invite-user', { body })` |
| `deleteMyAccount` | `functions.invoke('delete-account')` |

---

<a id="4-auth"></a>
## 4. Auth

### 4.1 `AuthProvider` (replaces `src/app/providers.tsx` context)

```tsx
// src/app/providers.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dataClient } from '../lib/data/client';
import type { AuthUser } from '../types/auth';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
});

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  /** Convenience for the many pages that did `const { familyId } = useAuth()`. Throws if used outside a parent route. */
  familyId: string;
  teacherId: string;
  role: AuthUser['role'] | null;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}
const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <Providers>');
  return v;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setUser(await dataClient.getMyContext()); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    // IMPORTANT: keep this callback synchronous. Awaiting supabase calls inside onAuthStateChange can deadlock;
    // defer the work with setTimeout so it runs after the auth event is fully processed.
    const off = dataClient.onAuthChange(event => {
      if (event === 'SIGNED_OUT') { setUser(null); queryClient.clear(); return; }
      setTimeout(() => { void refresh(); }, 0);
    });
    return off;
  }, [refresh]);

  const value = useMemo<AuthCtx>(() => ({
    user, loading, role: user?.role ?? null,
    familyId: user?.familyId ?? '', teacherId: user?.teacherId ?? '',
    signIn: async (e, p) => { const u = await dataClient.signIn(e, p); setUser(u); return u; },
    signOut: async () => { await dataClient.signOut(); setUser(null); queryClient.clear(); },
    refresh,
  }), [user, loading, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
```

`queryClient.clear()` on sign-out matters: otherwise the next person on a shared computer briefly sees the previous family's cached data.

The setters `setRole` / `setFamilyId` **no longer exist** — that is what makes the DemoBar and the old signup hack (`setFamilyId('f4')`) impossible.

### 4.2 Route guards (`src/app/RequireRole.tsx`) and router changes

```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './providers';
import type { Role } from '../types/auth';

const HOME: Record<Role, string> = { parent: '/parent', teacher: '/teacher', admin: '/admin' };

export function RequireRole({ allow }: { allow: Role[] }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="page-stack"><p>Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!allow.includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  return <Outlet />;
}
export const homeFor = (r: Role) => HOME[r];
```

In `router.tsx` wrap each group and add the missing auth routes (`phases.md` 0.8):

```tsx
{ element: <RequireRole allow={['parent']} />, children: [{ path: '/parent', element: <ParentLayout />, children: [ /* existing */ ] }] },
{ element: <RequireRole allow={['admin']} />,  children: [{ path: '/admin',  element: <AdminLayout />,  children: [ /* existing */ ] }] },
{ element: <RequireRole allow={['teacher']} />,children: [{ path: '/teacher',element: <TeacherLayout />,children: [ /* existing */ ] }] },
{ path: '/forgot-password', element: <ForgotPasswordPage /> },
{ path: '/reset-password',  element: <ResetPasswordPage /> },          // staff invite links only (§4.5)
{ path: '/shop',            element: <PublicShopPage /> },             // public, OUTSIDE every RequireRole wrapper
// inside the parent guard: 'shop' → LearningShopPage, 'orders' → MyOrdersPage
// inside the admin guard : 'orders' → AdminOrdersPage, 'shop-products' → AdminShopProductsPage (new, §14.6)
```

Admins are also teachers in this business ("My teaching"), so `AdminMyTeachingPage` uses `useAuth().teacherId` (the admin has a `teachers` row — Schema §14 seeds it). If `teacherId` is empty, show "Your account isn't set up as a teacher" instead of crashing.

> React Router has no data loaders here, so **RLS — not these guards — is the security boundary.** The guard is UX only.

### 4.3 Login (`LoginPage.tsx`)

- Delete `MOCK_CREDENTIALS`, `ROLE_DESTINATIONS` (replace with `homeFor`), the 700 ms fake latency and the **"Demo credentials" box**.
- `handleSubmit`: `const u = await signIn(email.trim().toLowerCase(), password); navigate(from ?? homeFor(u.role), { replace: true });`
- `catch (e) { setError(toAppError(e).message) }` → "Incorrect email or password. Please try again." (generic, `rules.md` §5).
- If the user is already signed in, redirect immediately (`useEffect` on `user`) — **on `/login` only**. Never add this redirect to `/signup` or `/forgot-password`: OTP verification creates a session mid-flow (§4.4 gotcha 1).

### 4.4 Signup — 4-step email-OTP flow (`SignupPage.tsx` + `OtpInput.tsx`)

Source: `SHOP_AND_AUTH_UPDATES.md` §12. The UI is **Details → Verify email → Set password → Done**. This replaces the earlier "sign up with a password, then confirm by link" design, so `dataClient.signUp` no longer exists.

| UI step | User action | `DataClient` call | What happens in Supabase |
|---|---|---|---|
| 0 Details | first/last name, email, optional phone | `requestSignupOtp({ email, firstName, lastName, phone })` | `auth.signInWithOtp({ email, options: { shouldCreateUser: true, data: { first_name, last_name, phone } } })` → GoTrue creates an **unconfirmed** user and emails a 6-digit code. The DB trigger (Schema §7) immediately creates the profile + family in the same transaction (role is always `parent`). |
| 1 Verify email | types the 6-digit code | `verifyOtp(email, code, 'signup')` | `auth.verifyOtp({ email, token, type: 'email' })` → email becomes confirmed, **a session is issued**, and `onAuthStateChange` fires `SIGNED_IN`. (The merge trigger also runs here: if an admin pre-created a family with this email, the new login is attached to it — Schema §7.) |
| 2 Password | password + confirm + agree to terms | `setPassword(password)` | `auth.updateUser({ password })` using the session from step 1 |
| 3 Done | "Go to my portal" | — | already signed in → `navigate('/parent')` |

**Changes to `OtpInput.tsx`** (props from the update note, minimally extended):

```ts
interface OtpInputProps {
  heading: string; subheading: ReactNode; stepLabel?: string;
  onVerify: (code: string) => Promise<void>;     // NEW: parent performs the real verifyOtp; throw AppError on a bad code
  onVerified: () => void;                        // called after onVerify resolves
  onBack: () => void;
  onResend: () => Promise<void>;
}
```

- Remove the hard-coded `'123456'` comparison, the `.otp-demo-hint` element and the `setTimeout` simulation. On the 6th digit (or paste) call `await onVerify(code)`; success → `onVerified()`; failure → existing error styling + `toAppError(e).message` ("That code is incorrect or has expired…").
- Disable the boxes while verifying (prevents double submission).
- **Resend countdown = 60 s**, not 30 s: Supabase enforces a minimum gap between auth emails to the same address (`max_frequency`, default 60 s). A 30-second UI timer would produce "rate limit" errors. If you want 30 s, set `max_frequency = "30s"` in config/Auth settings.
- After 5 wrong codes in a row, lock the boxes for 30 s client-side (UX only — Supabase rate-limits verification attempts server-side too).

**Gotchas to handle (each one bites in practice):**

1. **Do not auto-redirect away from `/signup` or `/forgot-password` when `user` appears.** Verifying the code *creates a session* mid-flow. Any "already signed in → go to portal" `useEffect` (e.g. in `LoginPage`) must not exist on these two pages, or the user is thrown out before the password step.
2. **Abandoned after step 1** → the account exists without a password. They can sign in later through **Forgot password** (§4.5). Put that hint in the login error text for unknown credentials.
3. **Existing email at `/signup`**: `signInWithOtp` simply emails a code to the existing account and verification signs them in. That is acceptable (inbox ownership proven, same as password recovery) but the UI must **never** say "email already registered". Also note the `data` metadata (names/phone) is applied only when the user is *created*.
4. **Junk rows**: step 0 creates the user + family before the inbox is proven. Migration 0013 purges unverified users after 7 days (Schema §13B).
5. **Terms checkbox at step 2** is UI-only. Legal consent is captured at enrolment (`enrolments` table). If the client wants signup consent recorded as well, add `profiles.terms_accepted_at` later — `TODO: confirm with client`.
6. Names/phone/email are validated with zod before calling the backend (rules.md §2); the backend never trusts them for authorization.

### 4.5 Forgot password — 4-step email-OTP flow (`ForgotPasswordPage.tsx`)

| UI step | `DataClient` call | Supabase |
|---|---|---|
| 0 Email | `requestPasswordResetOtp(email)` | `auth.resetPasswordForEmail(email)` — **always advance to step 1**, whether or not the email exists (no account enumeration) |
| 1 Verify code | `verifyOtp(email, code, 'recovery')` | `auth.verifyOtp({ email, token, type: 'recovery' })` → recovery session |
| 2 New password | `setPassword(pw)` | `auth.updateUser({ password })` |
| 3 Done | `await signOut()` **before** showing the button, then **Sign in now** → `/login` | forces a real login with the new password; clears the recovery session and the React Query cache |

Why `resetPasswordForEmail` and not `signInWithOtp({ shouldCreateUser: false })` (which the note's TODO also mentions): the latter returns an error for unknown emails, which leaks which addresses have accounts. The Recovery template must contain `{{ .Token }}` (below). If your Auth settings offer a **"password changed" notification email**, enable it.

**`/reset-password` stays, but only for staff invitations.** The `admin-invite-user` function (§7.2) emails an invite *link*; it lands on `/reset-password` with a session (`detectSessionInUrl: true`), the page shows two password fields → `setPassword(pw)` → navigate to the role's home. The old "forgot password via link" use of that page is gone. If there is no session, show "This link has expired — ask an admin to resend your invite."

### 4.5.1 Email templates and Auth settings the OTP flows depend on

Supabase uses **three** templates for these flows; **all must print `{{ .Token }}`**, otherwise users receive a link and no code:

| Flow | Template |
|---|---|
| Signup (new email) | **Confirm signup** |
| Signup with an email that already exists | **Magic Link** |
| Forgot password | **Reset Password** |

```html
<h2>Your Fairybread &amp; Fractions code</h2>
<p>Enter this code to continue:</p>
<p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
<p>It expires in 10 minutes. If you didn’t ask for it, you can ignore this email.</p>
```

Hosted settings these flows depend on (Dashboard — see §2.1 steps 5–8):

| Dashboard section | Setting |
|---|---|
| Auth → Sign In / Providers → Email | **Confirm email ON**; **Email OTP length 6**; **Email OTP expiration 600 s** |
| Auth → SMTP Settings | **Custom SMTP** (the built-in sender won't deliver to normal users) and **minimum interval between emails = 60 s** — the UI resend timer must be ≥ this value |
| Auth → Email Templates | The HTML above in **Confirm signup**, **Magic Link** and **Reset Password**; subjects: "Your Fairybread & Fractions code" / "Your password reset code" |
| Auth → Rate Limits | Emails per hour (raise on dev while testing); token-verification limits stay at defaults |

Codes arrive in a real inbox. Use plus-addressed emails for test parents (`you+parent1@gmail.com`).

### 4.6 Staff accounts

Admin → Tutors → **"Invite tutor"** calls `inviteStaff` → Edge Function `admin-invite-user` (§7.2) which sends a Supabase invite email (link-based; it lands on `/reset-password`, §4.5), creates the `teachers` row and sets `profiles.role` using the service role. Parents can never become staff by any client-side route (Schema §11: no `UPDATE(role)` grant).

---

<a id="5-pages"></a>
## 5. Page-by-page frontend changes

Convention for every page: **loading → error (with retry) → empty → data** (`rules.md` §5). Every mutation gets `onError` that renders `toAppError(e).message` in the existing `.auth-error` style.

### 5.1 Shell, layouts, shared

| File | Change |
|---|---|
| `components/layout/AppShell.tsx` | Delete `roleLabels` names (`'Sarah Johnson'`, `'Therese'`, `'Jessica Taylor'`) → use `useAuth().user` (`fullName`, initials from name, workspace label by role). Delete `notifTeacherId = 'tch1'`. `useNotifications()` takes no ids. **Delete `DemoBar` and its call.** Add a "Sign out" action in the profile menu (the `MoreHorizontal` icon is already there). Remove unused `onSwitchRole`/`onHome` props (`phases.md` 0.4). Move `Role` type to `types/auth.ts`. |
| `ParentLayout.tsx` / `AdminLayout.tsx` / `TeacherLayout.tsx` | Replace hard-coded titles: `Good ${timeOfDay}, ${user.firstName}`; `"Emma's classes"` → `"${selectedChild.firstName}'s classes"` via a small `useSelectedChild()` (zustand store, the one allowed use of zustand) or neutral titles. Remove `onSwitchRole`/`onHome`. |
| `hooks/useNotifications.ts` | Rewrite (§9.2): `useQuery(qk.notifications)`, mutations without ids, Realtime subscription. |
| `components/domain/TermCreditMeter.tsx` | Reads `term.classes_included/remaining/end_date` — no change except `end_date` is **exclusive**: display "ends {end_date − 1 day}". |
| `lib/config.ts` | Delete `INDIVIDUAL_CLASS_PRICE`, `TERM_BASE_PRICE`, `REGISTRATION_FEE`, `GST_RATE`, `TERM_TOTAL`, `TERM_CREDITS`, `TERM_WEEKS`, `TERM_EXPIRY_WARNING_WEEKS`. Keep only `TEACHER_PRICE_IS_PARENT_FACING = false` (UI policy) and add `export const SUPPORT_EMAIL`. Consumers to fix: `BookAssessmentPage`, `PaymentsPage`, `BookClassPage`, `AdminPaymentsPage`, `AdminParentsPage`, `AdminTimetablePage`, `AdminFamilyBookingPage`, `TeacherClassesPage`, plus `termUtils.ts` (`TERM_EXPIRY_WARNING_WEEKS`) → pass the value in as a parameter from `useAppSettings()`. |
| `hooks/useAppSettings.ts` (new) | `useQuery(qk.settings, dataClient.getSettings, { staleTime: 5 min })` → `{ pricing, termRules, business, assessmentBooking }`. |
| `lib/utils/money.ts` (new) | `formatMoney(cents) → "$583.00"` (`Intl.NumberFormat('en-AU', {style:'currency', currency:'AUD'})`). All pages display via this; no page does `* 1.1`. |
| `ErrorBoundary` | Add around `<AppRouter/>` (`phases.md` 0.7). |

### 5.2 Parent portal

| Page | Today (problem) | Required change |
|---|---|---|
| **DashboardPage** | `enrichment` array is hard-coded (maths 80%, "+12%", "Emma did a brilliant job…"); fake dates | Delete `enrichment`. *Upcoming classes* = `getBookings(familyId)` filtered to `confirmed`, `session.starts_at > now`, for the selected child, first 3. *Sessions this term* = count of bookings in the active term. *Attendance %* = `getChildAttendance(child.id)` (present+late / total) — hide the widget if none. *Tutor note* = latest `getReportsForChild(child.id)[0].note` + its teacher; hide if none. Maths/English progress bars: derive from the latest report's `subjects[]` ratings (rating/5), or hide until a report exists. Remove hard-coded `'Available in 12 days'`. |
| **ChildrenPage** | `enrichment[c.id]` hard-coded; `addChild` takes `name` and splits | Remove `enrichment`. Form fields `givenName` + `familyName` (or split once in the handler). Focus tags from `child.subjects`. |
| **ChildProfilePage** | `enrichmentByChildId`; goals not saved | Remove. Overview from `Child`; **Goals tab**: edit `goals` → `updateChild`. *Attendance tab*: `getChildAttendance`. *Sessions tab*: bookings. *Notes tab*: read-only `notes` (parent-entered during enrolment). |
| **EnrolmentPage** | `addChild(...)` with an existing child → **duplicate**; fire-and-forget `.then` | `useMutation(() => dataClient.completeEnrolment(selectedChild.id, {...}))`; `setStep(5)` **in `onSuccess`**; show `onError`. The 3 consent checkboxes + typed signature are validated server-side too (`consent_required`, `signature_required`). Parent step fields map to `p_parent`. `openDoc` uses `getDocuments()` public URLs. Replace `alert()` with an inline message. |
| **BookAssessmentPage** | Hard-coded calendar "October 2025", date `13`, slots, "Tuesday 14 October 2025", `FAMILY_NAMES`, fake upload, `type: 'individual_class'` | Slots/weekdays/lead-time/horizon come from `settings.assessmentBooking`. Build the date grid from today (skip non-allowed weekdays and `closures`). Real `<input type="file">` (§6.1). Submit with `PaymentIntent { type:'assessment', childId, date, time }` — the server creates the payment **and** the `assessments` row (`awaiting_payment`). Success screen shows the chosen date/time, not a constant. Price from `getPriceQuote('assessment')`. Bank details + reference from settings / `family.reference_code`. Delete `FAMILY_NAMES`, `ASSESSMENT_*`. |
| **BookClassPage** | Local `classes` array (3 fixed classes, fake "4 spaces"); credit booking **not persisted**; individual-mode toggle still clickable when gated | Replace with `getUpcomingSessions({ from: today })` grouped by class (show the next N dates per class or a week selector). Spaces = `spaces_left`; `0` → **FULL** + *Join waiting list* (`joinWaitlist`). **Credit path:** `useMutation(bookClassSession)`; `onSuccess` invalidates per §3.5; `onError` → friendly message (e.g. `class_full`, `no_credits`, `session_outside_term`). **Individual path:** navigate to `/parent/payments` with `{ type:'individual', childId, sessionId }` (IDs, not display strings). `NO_TERM_EVER`: banner copy "Individual classes unlock after your first term purchase" and the toggle truly disabled (`phases.md` 3.1). Never render `class_rates.price`. |
| **BookingsPage** | Joins `getClassInstances`; cancel always restores credit | Bookings now arrive with `session`+`child` embedded. Show date+time. Cancel dialog computes **preview** `hoursUntil >= settings.termRules.cancellation_window_hours` ("Your credit will be returned" / "Too late for a credit"), the real outcome is in the RPC result → toast "Credit returned" or "Cancelled — credit not returned". `pending_payment` bookings show a "Awaiting payment verification" badge; `waiting_list` shows "On waiting list" with *Leave*. |
| **PaymentsPage** | Hard-coded `FAMILY_NAMES`, bank details, `'Term 3, 2025'`, subtotal/GST maths, fake upload (`setUploadedFile('term-payment-receipt.jpg')`) | See §6. Delete `TERM_SUBTOTAL/GST/TOTAL`, `FAMILY_NAMES`. Reference = `${family.reference_code}-TERM` etc. History list from `getPayments(familyId)` with `review_note` shown on rejection. |
| **ReportsPage** | Fetches every teacher then every report | `getReportsForChild(child.id)` (RLS returns published only). Teacher name via join. |
| **MessagesPage** | `participant_ids` includes `familyId`; sends `sender_name: 'Sarah Johnson'` | `getConversations()` (no id arg); `sendMessage(convId, body)` (server sets sender). Auto-create the support thread on first visit: `startConversation('parent_staff', { familyId })`. Teacher threads appear once a teacher has messaged, or via "Message {teacher}" on the child profile (`startConversation('parent_teacher', …)`). Realtime appends (§9.3). |

### 5.3 Admin portal

| Page | Today | Required change |
|---|---|---|
| **AdminHomePage** | Fully hard-coded stats and "today" rows | `getAdminStats()` for the five tiles (+ revenue). *Today's schedule* = `getUpcomingSessions({ from: startOfToday, to: endOfToday })` joined with `getAllBookings`. Chart bars from `stats.weekly_attendance` (hide chart if empty). |
| **AdminBookingsPage** | `ALL_FAMILY_IDS` loop | `getAllBookings()`, `getAllChildren()`, `getTeachers()`; cancel via `cancelBooking(id, { restoreCredit })` — admin may override the 24h rule with an explicit "Return credit?" checkbox. |
| **AdminFamilyBookingPage** | `FAMILY_NAMES`, `CLASS_OPTIONS`, duplicated pricing, **submits `status: 'paid'` from the browser** | Families from `getAllFamilies()`. Gating from `getGating(familyId)` (same rule as parents — `phases.md` 3.1). Classes from `getUpcomingSessions`. *Term purchase* → `adminRecordPayment({ type:'term' })`. *Credit booking* → `bookClassSession(childId, sessionId)` (the RPC permits admins). *Individual class* → `adminRecordPayment({ type:'individual_class', childId, sessionId })` (immediately confirmed). *New family without portal access* → `createFamily`. *Add child* → `addChild`. Booking requires an enrolled child, so when the RPC returns `child_not_enrolled` show a **"Mark as enrolled (paper form)"** button → `adminMarkEnrolled(childId)`, then retry. |
| **AdminPaymentsPage** | `ALL_FAMILY_IDS`, pending loop | `getAllPayments()` + status filter; stats from the same list. Row detail shows **"View proof"** → `getProofUrl(id)` → open in a new tab (signed URL expires in 5 min). Approve/Reject → `verifyPayment(id, action, note)`; reject requires a note (it's shown to the parent). Show `type`, `details.subject/child`, `total_cents`, `reference`. |
| **AdminParentsPage** | `FAMILY_NAMES/EMAILS/PHONES`, per-family loops | One query: `getAllFamilies()` (`v_family_summary` has name, email, phone, gating state, credits, last payment status, child count, `has_portal_access`). Detail modal: `getChildren(familyId)`, `getTerms(familyId)`, `getPayments(familyId)`; actions: *Adjust credits* (`adminAdjustCredits`, note required). |
| **AdminMessagesPage** | `ADMIN_ID = 'admin'`; compose recipients are 4 hard-coded names | `getConversations()`; compose modal lists `getAllFamilies()` + `getTeachers()` → `startConversation` then `sendMessage`. Quick-action tiles (payment reminder, etc.) call `sendMessage(..., is_reminder)`. |
| **AdminTutorsPage** | Read-only | + *Invite tutor* → `inviteStaff`. Class counts from `getClassSlots()`. |
| **AdminTimetablePage** | CRUD on `ClassInstance`, `price: INDIVIDUAL_CLASS_PRICE` | CRUD on `ClassSlot` (`day_of_week` ISO number, `start_time`, `duration_minutes`, `capacity`, `program_id`, `teacher_id`, price). Delete → `deactivateClassSlot` with a confirm showing the count of affected bookings; if `class_has_bookings` is returned, offer "Cancel upcoming sessions too". Add per-session *Cancel this session* (public holidays) → `cancelSession(id, reason)`; add *Closures* editor (Schema `closures`). |
| **AdminProgramsPage** | Local `useState` programs | `getPrograms()` / `upsertProgram()`; student counts from `v_program_stats`. |
| **AdminSettingsPage** | `defaultValue` business info; docs via `uploadDocument`; prefs are local state; Save does nothing | Business info → `updateSetting('business', {...})`; **bank + contact details → `updateSetting('public_info', {...})`** (feeds every payment screen *and* guest checkout); shop rules → `updateSetting('shop', {...})` (§14.6). Pricing/term rules editor → `updateSetting('pricing'|'term_rules')` (**"Ask first" items in `rules.md`** — gate the UI behind a confirmation). Documents → real storage upload. Notification toggles → `setNotificationPref()` per category (map: `newBookings→new_bookings`, `cancellations→cancellations`, `payments→payments`, `reports→reports`, `reminders→reminders`, plus new **Shop orders → `orders`**) + a **"Enable push on this device"** button (§8.4). |
| **Waiting lists** | Route does not exist in `router.tsx` | Optional: add `/admin/waiting-lists` using `getWaitingList()`; promotion is automatic by notification (`waitlist_spot_open`). |

### 5.4 Teacher portal

| Page | Today | Required change |
|---|---|---|
| **TeacherLayout / all `TeacherXPage`** | `<TeacherXView teacherId="tch1" />` | `const { teacherId } = useAuth()`; keep the `View` components if `AdminMyTeachingPage` reuses them. |
| **TeacherDashboardPage** | Reads all classes; colour maps keyed `tch1..3` | Today's sessions: `getUpcomingSessions({ teacherId, from: startOfToday, to: endOfToday })`. Colour from `Teacher.color`. |
| **TeacherClassesPage** | **Local state only** | `getClassSlots()` filtered by `teacher_id`; create/update via `createClassSlot/updateClassSlot` (price + capacity, zod-validated: capacity ≥ 1, price ≥ 0) — RLS only lets a teacher touch their own classes. |
| **TeacherStudentsPage** | `ALL_FAMILY_IDS` loops | `getBookingsForTeacher()` (RLS already limits to own classes) → group by child. Children names come embedded; **teachers cannot read `families`** (contact details stay private); to message a parent use `startConversation('parent_teacher', …)`. |
| **TeacherAttendancePage** | `handleSave = () => setSaved(true)` (not persisted); statuses keyed by child | Pick a **session** (date), not just a class: `getUpcomingSessions({ teacherId, from: today-14d, to: today+1d })`. Pre-load `getAttendance(sessionId)`. Save → `saveAttendance(sessionId, records)`. Status values: `present | absent | no_show | late` (the UI's `'No-show'` maps to `no_show`). |
| **TeacherAssessmentsPage** | `ALL_FAMILY_IDS`, creates one record per student | `getTeacherAssessments()`; create → `createTeacherAssessments(rows)`; mark complete → `updateAssessment(id, { status:'completed' })`. |
| **TeacherReportsPage** | `CURRENT_TERM = 'Term 3, 2025'`; loops | `settings.business.current_term_label`; students from `getBookingsForTeacher()`; `getTeacherReports()` to mark who's done; `createReport` (parent notified automatically). |
| **TeacherMessagesPage** | `teacherId` prop, sends `sender_name: 'Jessica Taylor'` | `getConversations()`, `sendMessage(convId, body)`. Teacher↔admin thread: `startConversation('teacher_staff', { teacherId })`. |
| **AdminMyTeachingPage** | `useState('tch1')` | Initial value `useAuth().teacherId`; the selector (admin viewing other teachers) can remain admin-only. |

### 5.5 Marketing

> The public shop (`/shop`) and the landing-page *Shop* link are specified in **§14.6**.

`LandingPage.tsx` contains decorative sample text ("Good afternoon, Sarah", "3:30 PM · Jessica Taylor"). It is a static illustration of the product, not data — leave it, but make sure it contains no real family's details. If the landing page should show live pricing, mark `pricing` `is_public = true` in `app_settings` (Schema §5) and read it anonymously.


---

<a id="6-payments"></a>
## 6. Payments, proof upload and pricing

The old flow was: client computes `subtotal`/`gst`, client stores `receipt_filename` (a fake string from a click handler), client writes `status:'pending'` (or even `'paid'` in admin family-booking). The new flow makes the **server** the only authority on amounts and status.

### 6.1 Shared pieces

```tsx
// src/features/payments/ProofUpload.tsx  (one component replaces 3 copies of the fake upload-area)
const MAX = 10 * 1024 * 1024;
const OK = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

export function validateProof(f: File): string | null {
  if (!OK.includes(f.type)) return 'Please upload a JPG, PNG, WebP, HEIC or PDF.';
  if (f.size > MAX) return 'That file is over 10 MB. Please choose a smaller one.';
  return null;
}
// Render: <input type="file" accept="image/*,application/pdf" hidden ref={…}/> behind the existing
// .upload-area / .upload-attached markup; keep the File object in state (NOT just its name).
```

```tsx
// src/features/payments/usePriceQuote.ts
export const usePriceQuote = (type: PaymentType, familyId: string) =>
  useQuery({ queryKey: qk.quote(type, familyId), queryFn: () => dataClient.getPriceQuote(type, familyId), enabled: !!familyId });
```

Pages show `quote.base_cents`, `quote.registration_cents`, `quote.gst_cents`, `quote.total_cents` via `formatMoney()`. The word "GST (10%)" comes from `settings.pricing.gst_rate`. **There is no pricing arithmetic left in any component.**

Bank details panel (`BSB 062 000` / `1234 5678` are placeholders in three files today) → `settings.public_info.bank`; reference → `${family.reference_code}-TERM|CLASS|ASSESS` (the exact string the server stores).

### 6.2 `submitPayment(intent, proof)` implementation

```ts
// src/lib/data/supabase/payments.ts  (excerpt)
async submitPayment(intent, proof) {
  const id = crypto.randomUUID();                                    // idempotency key (RN: expo-crypto randomUUID)
  const safe = proof.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const path = `${intent.familyId}/${id}/${safe}`;                   // MUST match Schema RLS: {family_id}/{payment_id}/{file}

  const up = await sb.storage.from('payment-proofs').upload(path, proof, { contentType: proof.type, upsert: false });
  if (up.error) throw toAppError(up.error);

  try {
    return mapPayment(await rpc(sb, 'submit_payment', {
      p_id: id, p_family_id: intent.familyId, p_type: intent.type,
      p_proof_path: path, p_proof_filename: proof.name,
      p_child_id: 'childId' in intent ? intent.childId : null,
      p_class_session_id: intent.type === 'individual_class' ? intent.sessionId : null,
      p_assessment_date: intent.type === 'assessment' ? intent.date : null,
      p_assessment_time: intent.type === 'assessment' ? intent.time : null,
    }));
  } catch (e) {
    // The RPC rejected the request (e.g. class_full). Best-effort: the orphan file is harmless and is
    // swept by the weekly storage cleanup (§13). Surface the real reason to the user.
    throw e;
  }
}
```

Retry safety: if the network drops after the RPC succeeded, the user taps *Submit* again → a **new** UUID would create a duplicate. So hold the generated `id` in component state (`useRef(crypto.randomUUID())`) for the lifetime of the form and pass it in (`submitPayment(intent, proof, id)`); the RPC returns the existing row for a repeated id.

### 6.3 Individual-class purchase (credit-less) flow end to end

1. `BookClassPage` → *Pay for this class* → `navigate('/parent/payments', { state: { type:'individual', childId, sessionId } })`.
2. `PaymentsPage` reads the IDs, loads the session (`getUpcomingSessions` by id) for display, shows `getPriceQuote('individual_class')`.
3. Parent pays by bank transfer, attaches proof → `submitPayment({ type:'individual_class', … }, file)`.
4. Server: validates family has ≥ 1 term ever (`no_term_ever` otherwise), re-checks capacity, creates `pending` payment, **holds the seat** (`class_bookings.status = 'pending_payment'`, 72 h hold from `term_rules.hold_hours`), notifies admins (push).
5. Admin approves → booking becomes `confirmed`, `individual_class_purchases` row written, parent gets `payment_approved` (push). Rejects → seat released, next waitlisted family notified.
6. If nobody reviews within the hold window, the 15-minute cron releases the seat (Schema §13).

### 6.4 Term purchase

Same flow with `{ type:'term' }`. On approval the server creates the term (`start = today`, or the **end of the current term** on early renewal — Schema §8 `apply_paid_payment`), grants 10 credits via the ledger, and notifies. The UI needs no knowledge of this: it invalidates `terms`, and `useTermStatus` recomputes gating.

---

<a id="7-edge-functions"></a>
## 7. Edge Functions

Source lives in the repo at `supabase/functions/<name>/index.ts` (version control only). **Deploy through the dashboard:** Edge Functions → *Deploy a new function* → *Via Editor* → name it **exactly** as below → paste the file → Deploy. To change a function later, edit it in the dashboard and re-deploy, and keep the repo copy in sync.

- Each function must be a **single self-contained file** (the editor cannot resolve `../_shared/…`), so the CORS headers are inlined below. npm specifiers such as `npm:jose@5` work.
- **Verify JWT:** switch it **off** for `send-push` and `shop-guest-checkout` (they are called by the database / anonymous visitors and protect themselves with a shared secret / CAPTCHA + rate limits); leave it **on** for `admin-invite-user` and `delete-account`.
- **Secrets:** Edge Functions → *Secrets*. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically; add the rest by hand: `FIREBASE_SERVICE_ACCOUNT` (paste the entire service-account JSON), `PUSH_WEBHOOK_SECRET` (same string as the Vault secret `push_function_secret`), `APP_URL`, `IP_HASH_SALT`, and optionally `TURNSTILE_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`.
- **Logs:** each function has a Logs tab — your first stop when push or guest checkout misbehaves.

A fourth function, **`shop-guest-checkout`**, is specified in §14.4.

### 7.1 `send-push` — the FCM sender

Triggered by the database (Schema §6 `dispatch_push` → `pg_net`) for every new `notifications` row, plus a once-a-minute sweeper for retries. It authenticates to Google with the **service-account** (OAuth 2.0) and calls the **FCM HTTP v1** API; the old "server key"/legacy API no longer exists.

```ts
// supabase/functions/send-push/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { SignJWT, importPKCS8 } from 'npm:jose@5';

const SA = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!);          // {project_id, client_email, private_key}
const SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET')!;
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

// ── Google OAuth2 access token (cached ~55 min per warm instance) ───────────────
let cached: { token: string; exp: number } | null = null;
async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const key = await importPKCS8(SA.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(SA.client_email).setSubject(SA.client_email)
    .setAudience('https://oauth2.googleapis.com/token').setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`oauth ${res.status}`);
  const j = await res.json();
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

type Result = 'ok' | 'dead' | 'retry';
async function sendOne(token: string, n: any, badge: number): Promise<Result> {
  const link = n.action_url ? `${APP_URL}${n.action_url}` : APP_URL;
  const data: Record<string, string> = {                                 // FCM data values MUST be strings
    notification_id: n.id, type: n.type, action_url: n.action_url ?? '',
    ...Object.fromEntries(Object.entries(n.data ?? {}).map(([k, v]) => [k, String(v)])),
  };
  const message = {
    token,
    notification: { title: n.title, body: n.body },
    data,
    webpush: { ...(link.startsWith('https://') ? { fcm_options: { link } } : {}), notification: { icon: `${APP_URL}/assets/image.png`, tag: n.id } },   // FCM only accepts https links; with a dev APP_URL of http://localhost the link is omitted and the service worker routes by data.action_url
    android: { priority: 'HIGH', notification: { channel_id: 'default', tag: n.id } },
    apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default', badge } } },
  };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (res.ok) return 'ok';
  const err = await res.json().catch(() => ({}));
  const status = err?.error?.status as string | undefined;
  const code = err?.error?.details?.find((d: any) => d.errorCode)?.errorCode as string | undefined;
  if (status === 'NOT_FOUND' || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT' && /token/i.test(err?.error?.message ?? '')) return 'dead';
  return 'retry';                                                          // 429/5xx/UNAVAILABLE/INTERNAL/QUOTA_EXCEEDED → try again later
}

async function process(id: string) {
  const { data: n } = await sb.rpc('claim_notification_push', { p_id: id });
  if (!n || !n.id) return;                                                 // already claimed/sent elsewhere
  const { data: devices } = await sb.from('user_devices').select('id, fcm_token')
    .eq('profile_id', n.recipient_id).is('disabled_at', null);
  if (!devices?.length) {
    await sb.from('notifications').update({ push_status: 'skipped' }).eq('id', n.id);  // no device: in-app only
    return;
  }
  const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true })
    .eq('recipient_id', n.recipient_id).is('read_at', null);

  let ok = 0, retry = 0; const dead: string[] = [];
  for (const d of devices) {
    const r = await sendOne(d.fcm_token, n, count ?? 1);
    if (r === 'ok') ok++; else if (r === 'dead') dead.push(d.id); else retry++;
  }
  if (dead.length) await sb.from('user_devices').update({ disabled_at: new Date().toISOString() }).in('id', dead);

  if (ok > 0 || (retry === 0)) {
    await sb.from('notifications').update({ push_status: ok > 0 ? 'sent' : 'skipped', push_sent_at: new Date().toISOString(), push_error: null }).eq('id', n.id);
  } else if (n.push_attempts >= 5) {
    await sb.from('notifications').update({ push_status: 'failed', push_error: 'max attempts' }).eq('id', n.id);
  } else {
    await sb.from('notifications').update({ push_error: 'transient failure, will retry' }).eq('id', n.id);  // stays 'pending' → sweeper
  }
}

Deno.serve(async req => {
  if (req.headers.get('x-webhook-secret') !== SECRET) return new Response('unauthorized', { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body.notification_id) { await process(body.notification_id); return Response.json({ ok: true }); }
  if (body.sweep) {
    const { data } = await sb.from('notifications').select('id').eq('push_status', 'pending').lt('push_attempts', 5)
      .lt('created_at', new Date(Date.now() - 60_000).toISOString()).order('created_at').limit(50);
    for (const row of data ?? []) await process(row.id);
    return Response.json({ ok: true, swept: data?.length ?? 0 });
  }
  return new Response('bad request', { status: 400 });
});
```

Notes on the design:
- **At-least-once, effectively once:** `claim_notification_push` (Schema §6) stamps `push_claimed_at`; a second invocation within 2 minutes gets `null` and exits.
- **Dead tokens** (`UNREGISTERED`) are disabled immediately, so a user who uninstalled the app stops generating work.
- **A user with no devices** gets `push_status = 'skipped'` — the in-app bell still works.
- **Throughput:** one invocation per notification is fine at tutoring-centre scale. If you ever broadcast to thousands (an `announcement` to all families), insert the notification rows in one statement and let the sweeper batch them (50/min) or raise `limit`.
- Deploy via the dashboard (§7 intro) with **Verify JWT off** — it is protected by the shared secret, not a user JWT.

### 7.2 `admin-invite-user`

```ts
// supabase/functions/admin-invite-user/index.ts  (Verify JWT: ON)
import { createClient } from 'npm:@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};   // inlined: the dashboard editor deploys a single file and cannot resolve '../_shared/…'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization')! } } });
  const admin  = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: ctx } = await caller.rpc('get_my_context');                  // who is calling?
  if (ctx?.role !== 'admin') return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });

  const { email, fullName, role, subjects = [], color = 'pink' } = await req.json();
  if (!['teacher', 'admin'].includes(role) || !email || !fullName)
    return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: corsHeaders });

  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { first_name: fullName.split(' ')[0], last_name: fullName.split(' ').slice(1).join(' ') },
    redirectTo: `${Deno.env.get('APP_URL')}/reset-password`,                  // invite link lets them choose a password
  });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });

  const uid = invited.user.id;
  // The signup trigger made a parent profile + family; staff don't own a family.
  const { data: fm } = await admin.from('family_members').select('family_id').eq('profile_id', uid).maybeSingle();
  if (fm) await admin.from('families').delete().eq('id', fm.family_id);
  await admin.from('profiles').update({ role, full_name: fullName }).eq('id', uid);
  await admin.from('teachers').insert({ profile_id: uid, name: fullName, subjects, color });
  await admin.from('audit_log').insert({ actor_id: ctx.id, action: 'staff.invite', entity: 'profile', entity_id: uid, details: { role, email } });
  return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
```

Add `invite` email template wording in Auth → Email Templates (branded, "Set your password").

### 7.3 `delete-account` (App Store requirement for the future iOS app; also good privacy practice)

Verifies the caller, refuses if the caller is `admin`, then in this order: delete `user_devices`, delete the `auth.users` row via `admin.auth.admin.deleteUser(uid)` (cascades `profiles`, `family_members`, notifications). **Financial records are retained** (`payments.family_id` is `ON DELETE RESTRICT` by design) — so if the family has payments, anonymise instead of deleting: set `families.parent_name = 'Deleted user'`, null email/phone, archive children (`archived_at`), then delete the auth user. Document this in the privacy policy (Australian record-keeping obligations — confirm retention period with the client's accountant).

---

<a id="8-fcm"></a>
## 8. FCM push notifications — end to end

### 8.1 How the pieces fit

```
 Business event (booking, payment verified, new message, term ending…)
        │  inside an RPC / trigger / cron
        ▼
 private.notify*()  ──► INSERT notifications (per recipient profile, respects notification_preferences)
        │                    ├─ in-app bell: Realtime INSERT → UI (all clients)
        │ AFTER INSERT       └─ push_status = 'pending'
        ▼
 trigger → pg_net → Edge Function send-push ──► claim row ──► look up user_devices ──► FCM HTTP v1 (one call per token)
        │                                                              │
        └── cron every minute retries 'pending' rows (≤ 5 attempts)   └─► browser SW / iOS APNs / Android
```

**Who gets what** (all created server-side — the frontend never "creates a notification"):

| Event | Recipient(s) | Type | Created in |
|---|---|---|---|
| Credit/individual booking confirmed | family, class teacher | `booking_confirmed` | `book_class_session`, `apply_paid_payment` |
| Booking cancelled (by parent/admin) | family, teacher, admins | `booking_cancelled` | `cancel_booking` |
| Session cancelled by staff | every booked family | `session_cancelled` | `cancel_session` |
| Seat freed with a waiting list | first waitlisted family | `waitlist_spot_open` | `notify_waitlist` |
| Payment submitted | all admins | `payment_received` | `submit_payment` |
| Payment approved / rejected | family | `payment_approved` / `payment_rejected` | `verify_payment` |
| Assessment paid & confirmed | family | `assessment_confirmed` | `apply_paid_payment` |
| Report published | family | `report_ready` | trigger on `student_reports` |
| New chat message | the other party (admins / teacher / family) | `message_received` | `send_message` |
| Term ending within 2 weeks | family (+ system chat message) | `term_expiring` | daily cron |
| Class in < 24 h | family | `session_reminder` | hourly cron |
| Enrolment completed | admins | `enrolment_completed` | `complete_enrolment` |
| Shop order placed (portal or guest) | all admins | `shop_order_received` | `create_shop_order` |
| Shop bank transfer verified / rejected | family | `shop_payment_approved` / `shop_payment_rejected` | `verify_shop_order` |
| Shop order shipped / delivered / cancelled | family | `shop_order_update` | `admin_update_shop_order_status`, stale-order cron |
| Admin announcement | chosen recipients | `announcement` | add an `admin_broadcast` RPC if wanted (§13) |

### 8.2 Firebase project setup (one-time, per environment)

1. Firebase Console → create a project (separate **dev** and **prod** projects).
2. **Project settings → General → Your apps → Web app** → copy the config into the `VITE_FIREBASE_*` vars (§2.2).
3. **Project settings → Cloud Messaging → Web Push certificates → Generate key pair** → copy the public key to `VITE_FIREBASE_VAPID_KEY`.
4. Ensure **Firebase Cloud Messaging API (V1)** is enabled (Google Cloud Console → APIs). The legacy server-key API is gone; do not use it.
5. **Project settings → Service accounts → Generate new private key** → store the JSON **only** as an Edge secret: Dashboard → Edge Functions → *Secrets* → add `FIREBASE_SERVICE_ACCOUNT` and paste the **entire file contents** as the value; then delete the downloaded file from disk. Never commit it.
6. (Later, for mobile) add the iOS app (upload the APNs auth key `.p8` under Cloud Messaging) and the Android app (package name + SHA-1); download `GoogleService-Info.plist` / `google-services.json` into the RN app. The same Firebase project serves all three platforms, and the **same send-push function and `user_devices` table** already support them.

### 8.3 Web client files

**`public/firebase-messaging-sw.js`** — must live at the site root, served with `Content-Type: application/javascript`, and must not be hashed by the bundler. Because a service worker cannot read `import.meta.env`, the page passes the config in the registration URL.

```js
// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');       // pin to the SAME version as the npm `firebase` package
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const p = new URL(self.location).searchParams;
firebase.initializeApp({
  apiKey: p.get('apiKey'), authDomain: p.get('authDomain'), projectId: p.get('projectId'),
  messagingSenderId: p.get('messagingSenderId'), appId: p.get('appId'),
});
const messaging = firebase.messaging();   // FCM auto-displays `notification` payloads when the app is in the background

// Focus an existing tab (SPA) instead of always opening a new one.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.FCM_MSG?.fcmOptions?.link
           || event.notification.data?.FCM_MSG?.data?.action_url
           || '/';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { await c.focus(); c.postMessage({ type: 'NAVIGATE', url: new URL(url, self.location.origin).pathname }); return; } }
    await clients.openWindow(url);
  })());
});
```

**`src/lib/push/webPush.ts`**

```ts
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, deleteToken, isSupported, onMessage } from 'firebase/messaging';
import { dataClient } from '../data/client';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY, authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID, messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const TOKEN_KEY = 'fb_fcm_token';        // UI-preference-grade storage; the token is not a secret but is device-specific

export type PushState = 'unsupported' | 'denied' | 'default' | 'granted';

export async function pushState(): Promise<PushState> {
  if (!(await isSupported()) || !('Notification' in window)) return 'unsupported';
  return Notification.permission as PushState;
}

async function registration() {
  const qs = new URLSearchParams(cfg as Record<string, string>).toString();
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`, { scope: '/' });
}

/** MUST be called from a user gesture (button click) the first time — browsers block unprompted permission requests. */
export async function enablePush(): Promise<'ok' | PushState> {
  const st = await pushState();
  if (st === 'unsupported' || st === 'denied') return st;
  if (st === 'default' && (await Notification.requestPermission()) !== 'granted') return 'denied';
  return (await syncToken()) ? 'ok' : 'unsupported';
}

/** Idempotent. Call after every login and on every app start while permission is already granted. */
export async function syncToken(): Promise<string | null> {
  if ((await pushState()) !== 'granted') return null;
  if (!getApps().length) initializeApp(cfg);
  const token = await getToken(getMessaging(), {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY, serviceWorkerRegistration: await registration(),
  });
  if (!token) return null;
  await dataClient.registerDevice(token, 'web', { locale: navigator.language });   // upsert; bumps last_seen_at (token rotation handled for free)
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

/** Call BEFORE signOut so the next person on this browser doesn't receive this user's pushes. */
export async function disablePushForThisDevice() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  try { await dataClient.unregisterDevice(token); } catch { /* ignore — token will be pruned server-side */ }
  try { await deleteToken(getMessaging()); } catch { /* ignore */ }
  localStorage.removeItem(TOKEN_KEY);
}

/** Optional: foreground messages (tab visible). The Realtime channel already updates the bell; this only adds a toast. */
export function onForegroundPush(cb: (p: { title?: string; body?: string; url?: string }) => void) {
  if (!getApps().length) initializeApp(cfg);
  return onMessage(getMessaging(), m => cb({ title: m.notification?.title, body: m.notification?.body, url: m.data?.action_url }));
}
```

> `localStorage` here is allowed by `rules.md` §3 ("trivial UI preferences; never business data") — it stores a device token string only.

### 8.4 Where the UI plugs in

1. **Opt-in prompt (never on page load):** in `AppShell`, after login show a dismissible banner/inline card in the notification drawer: *"Get notified about bookings, payments and messages"* → button **Turn on notifications** → `enablePush()`. Remember dismissal for 30 days. States: `unsupported` (hide), `denied` (show "Enable notifications in your browser settings"), `default` (prompt), `granted` (nothing).
2. **Auto-sync:** in `AuthProvider`, after `user` becomes non-null, call `syncToken()` (no prompt; it no-ops unless already granted). This also keeps `last_seen_at` fresh for the 90-day pruning.
3. **Sign-out:** `signOut` = `await disablePushForThisDevice()` then `dataClient.signOut()`.
4. **Settings → Notification preferences** (admin page already has toggles; add the same card to a new *Parent → Notifications* section reachable from the bell drawer): one row per category with **Push** and **In-app** switches bound to `getNotificationPrefs()/setNotificationPref()`. The DB honours them inside `private.notify()`.
5. **Click-through:** `action_url` is the web route stored on the row. The service worker posts `{type:'NAVIGATE', url}` to the open tab; add once in `providers.tsx`:
   ```ts
   useEffect(() => {
     const h = (e: MessageEvent) => { if (e.data?.type === 'NAVIGATE') router.navigate(e.data.url); };
     navigator.serviceWorker?.addEventListener('message', h);
     return () => navigator.serviceWorker?.removeEventListener('message', h);
   }, []);
   ```
6. **Badge:** the bell's unread count = `notifications.filter(!read).length` (already in `useNotifications`); the push payload also carries the same count for iOS app badges.

### 8.5 Platform realities to communicate to the client

| Platform | Works? | Caveat |
|---|---|---|
| Chrome / Edge / Firefox (desktop, Android) | Yes | Needs HTTPS (localhost is exempt) and a granted permission |
| Safari macOS (16.4+) | Yes | Web Push via Safari; same code path |
| **iPhone / iPad** | Only if the site is **added to the Home Screen** (iOS 16.4+) | The parent portal is "mobile-first web" — add an "Install this app" hint on iOS. This is the main reason the native app (next section) will matter for parents |
| Native iOS / Android (future) | Yes | Same Firebase project, same Edge Function, same table (§12) |

### 8.6 Testing push

1. Deploy `send-push` (§7) and create the two Vault secrets (Schema §13.1) with your project's **hosted** function URL. `pg_net` reaches it directly — no tunnel needed. Watch **Edge Functions → send-push → Logs**, and `select * from net._http_response order by created desc limit 5;` to see what the database trigger called. The 1-minute sweeper retries anything that failed.
2. Register a device (click *Turn on notifications*), check `select * from user_devices;`.
3. Trigger an event as another user (e.g. admin approves a payment) → `select type, push_status, push_error from notifications order by created_at desc limit 5;` → `sent`.
4. Force-test one device from the Firebase Console → *Messaging → Send test message* with the token.
5. Negative tests: revoke browser permission (→ no push, in-app still works); sign out (→ `user_devices` row removed, no push); turn a category off in preferences (→ `push_status = 'skipped'`, or no in-app row if both off).

---

<a id="9-realtime"></a>
## 9. Realtime and in-app notifications

### 9.1 What is live

Only `notifications` and `messages` are in the `supabase_realtime` publication (Schema §12). Realtime obeys RLS, so a client only receives rows it could `SELECT`. Everything else uses normal React Query refetching (focus + invalidation after mutations).

### 9.2 `useNotifications` (rewrite)

```ts
// src/hooks/useNotifications.ts
export function useNotifications() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const q = useQuery({ queryKey: qk.notifications, queryFn: () => dataClient.getNotifications(50), enabled: !!user });
  const notifications = q.data ?? [];
  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = useMutation({
    mutationFn: (id: string) => dataClient.markNotificationRead(id),
    onMutate: async id => {                                            // optimistic
      await qc.cancelQueries({ queryKey: qk.notifications });
      const prev = qc.getQueryData<AppNotification[]>(qk.notifications);
      qc.setQueryData<AppNotification[]>(qk.notifications, p => p?.map(n => n.id === id ? { ...n, read: true } : n));
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx?.prev && qc.setQueryData(qk.notifications, ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
  const markAllRead = useMutation({
    mutationFn: () => dataClient.markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });

  return { notifications, unreadCount, markRead, markAllRead, isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
}
```

### 9.3 One subscription for the whole app (`src/hooks/useRealtime.ts`, mounted once inside `AppShell`)

```ts
export function useRealtime(onToast: (n: { title: string; body: string; url?: string }) => void) {
  const qc = useQueryClient();
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`user:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` }, p => {
        qc.invalidateQueries({ queryKey: qk.notifications });
        const n = p.new as any;
        onToast({ title: n.title, body: n.body, url: n.action_url });
        // Business state may have changed too — refresh the heavy hitters cheaply:
        if (['booking_confirmed','booking_cancelled','session_cancelled','payment_approved','payment_rejected','term_expiring'].includes(n.type)) {
          qc.invalidateQueries({ queryKey: ['bookings'] }); qc.invalidateQueries({ queryKey: ['terms'] }); qc.invalidateQueries({ queryKey: ['payments'] });
        }
        if (n.type.startsWith('shop_')) {
          qc.invalidateQueries({ queryKey: ['shopOrders'] }); qc.invalidateQueries({ queryKey: ['allShopOrders'] }); qc.invalidateQueries({ queryKey: qk.shopStats });
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
        const m = p.new as any;
        qc.invalidateQueries({ queryKey: qk.messages(m.conversation_id) });
        qc.invalidateQueries({ queryKey: qk.conversations });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id, qc]);
}
```

`supabase` is imported directly here **only** as a transport subscription; if you want zero `supabase` imports outside `lib/data/supabase`, move this into `dataClient.subscribe(userId, handlers)` returning an unsubscribe function (recommended — it also makes the React Native port trivial). The toast uses a new tiny `<Toast>` built from existing classes; a visible toast on foreground push replaces the browser notification that FCM does not show while the tab is focused.

---

<a id="10-mock-removal"></a>
## 10. Complete removal of the mock system

**Goal:** after this section, nothing in the repo can run without Supabase, and no file contains demo identity or seed data. The seed lives in SQL (`supabase/seed.sql`, Schema §14), used for the dev/staging project only.

### 10.1 Order of operations (do not skip the order — each step keeps `typecheck`/`lint`/`build` green)

| Step | Action | Exit check |
|---|---|---|
| 0 | Branch `feature/supabase-backend`. Get approval for `firebase` dependency. | — |
| 1 | Create `fairybread-dev`, complete the §2.1 dashboard checklist, run migrations 0001–0011, **0012a/0012b (shop), 0013 (OTP hygiene)** and the seed in the SQL Editor; (optional) generate `database.types.ts`. Run Schema §15.1–15.2. | Invariant queries return 0 rows; RLS smoke tests behave as documented |
| 2 | Add `src/lib/supabase.ts`, `lib/data/errors.ts`, `queryKeys.ts`, `types/*` changes (§3.2). **Keep the mock for the moment**; update both `DataClient` implementations to the v2 contract so the compiler lists every call site that needs changing. | `npm run typecheck` shows the exact set of pages to migrate |
| 3 | Implement `lib/data/supabase/*` (§3.7). | Each file's methods exercised from a scratch page or the browser console |
| 4 | Replace auth (§4): `AuthProvider`, `RequireRole`, Login, Signup, Forgot/Reset. Remove `DemoBar`. | Can sign in as each seeded role; refresh keeps the session; wrong role redirects |
| 5 | Migrate pages (§5) in this order: Parent (Dashboard→Children→Enrol→BookClass→Bookings→Payments→Reports→Messages) → Admin (Payments→Bookings→FamilyBooking→Parents→Messages→Timetable→Settings→Home) → Teacher. | Per-page exit checks (§11.2) |
| 6 | Wire notifications + Realtime (§9) and push (§8). | §8.6 tests pass |
| 7 | **Flip & delete** (§10.2). | §10.3 grep returns nothing |

### 10.2 Delete / change list (exact)

**Delete files**

```
src/lib/data/mock/client.ts
src/lib/data/mock/families.ts
src/lib/data/mock/messages.ts
src/lib/data/supabase/client.ts            (the throwing stub — replaced by supabase/index.ts)
```

**Edit files**

| File | Remove |
|---|---|
| `src/lib/data/client.ts` | The `VITE_DATA_SOURCE` switch and the mock import → `export const dataClient = createSupabaseDataClient(supabase)` |
| `src/vite-env.d.ts` / `.env.example` | `VITE_DATA_SOURCE`; add typed `ImportMetaEnv` entries for the `VITE_SUPABASE_*` and `VITE_FIREBASE_*` keys |
| `src/app/providers.tsx` | `useState('parent')`, `useState('f1')`, `setRole`, `setFamilyId` |
| `src/components/layout/AppShell.tsx` | `roleLabels` names, `notifTeacherId = 'tch1'`, entire `DemoBar` component and `<DemoBar … />` |
| `src/features/auth/pages/LoginPage.tsx` | `MOCK_CREDENTIALS`, `ROLE_DESTINATIONS` map, fake latency, the `.auth-demo-hint` block |
| `src/features/auth/pages/SignupPage.tsx` | `setRole`, `setFamilyId('f4')`, fake latency |
| `ParentLayout.tsx`, `AdminLayout.tsx`, `TeacherLayout.tsx` | name-bearing title strings, `onSwitchRole`, `onHome` |
| `DashboardPage.tsx`, `ChildrenPage.tsx`, `ChildProfilePage.tsx` | `enrichment`, `enrichmentByChildId` blobs |
| `BookClassPage.tsx`, `AdminFamilyBookingPage.tsx` | `classes`, `CLASS_OPTIONS` arrays |
| `PaymentsPage.tsx`, `BookAssessmentPage.tsx`, `AdminFamilyBookingPage.tsx`, `AdminParentsPage.tsx` | `FAMILY_NAMES`, `FAMILY_EMAILS`, `FAMILY_PHONES`, price constants, bank details literals, fake `setUploadedFile('…jpg')` |
| `AdminBookingsPage.tsx`, `AdminPaymentsPage.tsx`, `AdminParentsPage.tsx`, `TeacherAssessmentsPage.tsx`, `TeacherAttendancePage.tsx`, `TeacherReportsPage.tsx`, `TeacherStudentsPage.tsx` | `ALL_FAMILY_IDS` / `ALL_IDS` and their `Promise.all` loops |
| `TeacherReportsPage.tsx` | `CURRENT_TERM` constant |
| `AdminMyTeachingPage.tsx` | `useState('tch1')` |
| `AdminMessagesPage.tsx` | `ADMIN_ID`, hard-coded recipient list and `'Sarah Johnson'` default |
| `MessagesPage.tsx`, `TeacherMessagesPage.tsx` | hard-coded `sender_name` |
| `AdminSettingsPage.tsx` | `defaultValue` business literals (`Therese Howard`, phone, email) |
| `AdminProgramsPage.tsx` | local `useState` programs array |
| `features/auth/components/OtpInput.tsx` | hard-coded `'123456'` check, `.otp-demo-hint` element/CSS use, `setTimeout` simulation → real `onVerify` (§4.4) |
| `SignupPage.tsx`, `ForgotPasswordPage.tsx` | every `setTimeout`-simulated step and `// TODO` placeholder → `requestSignupOtp / verifyOtp / setPassword / requestPasswordResetOtp` |
| `LearningShopPage.tsx`, `ShopPage.tsx` (public), `MyOrdersPage.tsx`, `AdminOrdersPage.tsx` | local product data, `family_id: 'guest'` sentinel, fake `receiptFilename`-only upload, client-side totals, hard-coded bank card, hard-coded footer email in `printReceipt`; switch to `price_cents`/`order_number` (§14) |
| `lib/config.ts` | pricing/term constants (§5.1) |
| `lib/utils/termUtils.ts` | `import { TERM_EXPIRY_WARNING_WEEKS }` → parameter |
| `types/*.ts` | v2 shapes (§3.2) |
| `Fairybread_Fractions_Rebuild_Spec.md` | **Do not edit** (historical, `rules.md` §3). |

**Keep** (not mocks): `LandingPage` sample UI text, `components/ui/*`, `termUtils.ts` logic, `index.css`.

### 10.3 Verification greps (put in CI as `npm run check:no-mock`)

```bash
# 1) no mock/demo identity left anywhere in src
! grep -rnE "lib/data/mock|VITE_DATA_SOURCE|DemoBar|MOCK_CREDENTIALS|demo1234|admin1234|tutor1234|otp-demo-hint|_mockProducts|_shopOrders|'123456'" src
# 2) no hard-coded IDs / people
! grep -rnE "'f[1-4]'|'tch[1-3]'|'c[1-6]'|'ci[1-4]'|Sarah Johnson|Claire Brown|James Taylor|Michael Chen|Jessica Taylor|Daniel Smith|Therese|FAMILY_NAMES|FAMILY_EMAILS|FAMILY_PHONES|ALL_FAMILY_IDS|ALL_IDS|CLASS_OPTIONS" src --include=*.ts --include=*.tsx \
   --exclude=LandingPage.tsx
# 3) the only place allowed to touch the SDK for data
! grep -rn "supabase\.\(from\|rpc\|storage\|auth\|channel\)" src --include=*.ts --include=*.tsx | grep -v "src/lib/data/supabase/" | grep -v "src/lib/supabase.ts"
# 4) no client-side pricing math
! grep -rnE "\* *(1\.1|0\.1)|GST_RATE|TERM_BASE_PRICE|REGISTRATION_FEE|INDIVIDUAL_CLASS_PRICE" src
# 4b) shop/OTP specifics: no unescaped HTML injection, no guest sentinel logic outside the mapper
! grep -rn "dangerouslySetInnerHTML" src
! grep -rn "family_id === 'guest'\|familyId === 'guest'" src --include=*.tsx
# 5) no secrets in the bundle config
! grep -rnE "service_role|FIREBASE_SERVICE_ACCOUNT|PUSH_WEBHOOK_SECRET|IP_HASH_SALT|TURNSTILE_SECRET|RESEND_API_KEY" src public .env.example
```

(`!` makes the script fail if a match is found; wrap in a `scripts/check-no-mock.sh`.) Also confirm `dist/` after `npm run build` contains no `service_role` string.

---

<a id="11-testing"></a>
## 11. Testing the frontend against the real schema

### 11.1 Dev loop against the hosted dev project

```bash
npm run dev          # .env.local points at https://<dev-ref>.supabase.co — the only thing running locally is the Vite frontend
```

- **Reset to a pristine world** (replaces the old "refresh the page to reset the mock"): run `supabase/dev_reset.sql` then `supabase/seed.sql` in the SQL Editor (Schema §14.1). The editor shows a destructive-query warning — expected, **dev project only**. SQL cannot delete Storage files; empty the buckets from Dashboard → Storage when you want a clean slate.
- **Emails** (signup/reset codes) arrive in a real inbox through your custom SMTP; use plus-addresses (`you+parent1@gmail.com`).
- **Inspecting data:** Dashboard → Table Editor / SQL Editor. **Logs:** Dashboard → Logs (Auth, Postgres, Edge Functions) — the replacement for local terminal output.
- The dev database is shared by everyone using that project; agree who resets it.

### 11.2 Acceptance matrix (replaces `rules.md` §8 step 3, which used the mock families)

Log in as each seeded user (Schema §14) and verify:

| # | As | Do | Expect |
|---|---|---|---|
| 1 | `sarah@` (f1, 3 credits) | Dashboard | Credit meter 3/10; upcoming classes from real bookings; no hard-coded "Emma" text unless she is the selected child |
| 2 | `sarah@` | Book a class by credit | Meter → 2 on Dashboard, Book-class **and** Bookings without reload; teacher receives a notification |
| 3 | `sarah@` | Cancel that booking with > 24 h to go / < 24 h to go | Credit returns / does not return; message matches; seat freed |
| 4 | `sarah@` | Enrol an un-enrolled child | **No duplicate child**; `enrolled` true; admin gets `enrolment_completed` |
| 5 | `claire@` (f2, 0 credits) | Book by credit | Blocked in UI **and** `no_credits` if forced; individual-class path offered |
| 6 | `james@` (f3, expired) | Book by credit / buy individual class | Credit blocked (`term_expired`); individual allowed; pending payment shows seat hold |
| 7 | `michael@` (f4, none) | Book by credit; individual class | Both blocked (`no_term_ever`); can buy a term and an assessment |
| 8 | `michael@` | Upload real proof + submit term payment | Payment `pending`; file present in Storage; **admin** gets push/in-app |
| 9 | `admin@` | Payments → view proof → approve | Signed proof opens; f4 becomes `ACTIVE_TERM` with 10 credits (no reload needed on f4's side after Realtime); f4 gets `payment_approved` |
| 10 | `admin@` | Approve a 2nd term for f1 while active | New term starts at f1's current end date; credits don't merge |
| 11 | two browsers: `sarah@` and `claire@` | Both book the capacity-1 Reading class at once | Exactly one succeeds; other sees `class_full` + waitlist offer |
| 12 | `jessica@` | Students / Attendance / Reports | Only her own classes' students; attendance persists after reload; report triggers `report_ready` to the family |
| 13 | `jessica@` | Try URL `/admin` | Redirected to `/teacher` |
| 14 | `sarah@` | DevTools: `supabase.from('payments').update({status:'paid'})`, `from('terms').insert(...)`, `from('profiles').update({role:'admin'})`, read another family's child | All rejected (no grant / RLS) |
| 15 | any | Sign out → sign in as another user | No stale data (cache cleared), push token unregistered |
| 16 | `admin@` | Run `select * from v_counter_drift` after the whole session | 0 rows |
| 17 | signed-out | Open `/shop`, add items, guest checkout **COD** | Order created (`source = guest`, `family_id` null); on-screen `FBO-…` number; admins get a push/in-app; stock decremented |
| 18 | signed-out | Guest checkout **advance** with a receipt | Receipt in `shop-receipts/guest/{id}/…`; `payment_status = pending_verification` |
| 19 | signed-out | DevTools: `select` on `shop_orders`; `rpc('place_guest_order')`; `rpc('verify_shop_order')`; read the `shop-receipts` bucket | All denied |
| 20 | signed-out | Place 6 guest orders quickly from one browser | 6th → `rate_limited` |
| 21 | `sarah@` | Portal checkout, advance, tamper `price`/`family_id` in the request | Server totals unaffected; family from JWT |
| 22 | `sarah@` | Order more units than stock / the **Out of Stock** product | `out_of_stock`; cart message; product list refreshes |
| 23 | `sarah@` + `claire@` | Race for the last unit of *Reading Comprehension Cards* | One succeeds, stock never < 0 |
| 24 | `admin@` | Orders → Review → View receipt → Approve | Signed receipt opens; order → `paid/Processing`; family notified (push + bell) |
| 25 | `admin@` | Move `Pending → Shipped` | `invalid_transition`; valid path `Processing → Shipped → Delivered` works; COD becomes `paid` on Delivered |
| 26 | `admin@` | Cancel a paid order | Stock restored; `payment_status = refunded`; family notified |
| 27 | `admin@` | Create a guest order with address `<img src=x onerror=alert(1)>`, click **Receipt** | Rendered as text; no alert |
| 28 | new email | Signup: details → code from the email → password → portal | Session after step 1; profile + family exist; lands on `/parent`; no redirect mid-flow |
| 29 | new email | Signup: wrong code ×5, expired code, resend before 60 s | Friendly `otp_invalid`; boxes locked 30 s; resend gated to 60 s |
| 30 | `sarah@` | Forgot password: unknown email vs known email | Both advance to the code step (no enumeration); known email receives a code; after reset the user is signed out and must log in |
| 31 | any | Abandon signup after step 1, return next day, use Forgot password | Works; account gets a password |
| 32 | SQL | `select private.purge_unverified_users(interval '0 seconds')` after creating an unverified signup | Row, profile and empty family removed |

### 11.3 Automated tests (optional but recommended; adding Vitest/Playwright is "ask first")

- **SQL checks (no new npm deps, no CLI):** keep scripts in `supabase/tests/*.sql` and run them in the dev project's SQL Editor (same style as Schema §15.2): gating per family, credit decrement/restore around the 24 h boundary, capacity race (two sessions), RLS isolation, `submit_payment` idempotency.
- **Unit (Vitest):** `termUtils`, `errors.toAppError`, `mappers`.
- **E2E (Playwright):** happy path — signup → enrol → buy term → admin approves → book class → cancel; run against the dev project after `dev_reset.sql` + `seed.sql`.

---

<a id="12-react-native"></a>
## 12. React Native readiness (do now, build later)

The backend, schema, RPCs, Storage rules, Edge Functions and `user_devices` are already platform-neutral. To make the RN app a thin client, keep these rules **starting today**:

1. **No DOM/Vite in the data layer.** `lib/data/**`, `lib/utils/**`, `types/**`, `hooks` that don't render UI must not touch `window`, `document`, `localStorage`, `import.meta`, or `File`. Config comes through `createAppSupabase(url, key, opts)`; file inputs are typed `UploadFile = File | { uri: string; name: string; type: string }` (RN passes `{uri,name,type}` or a `Blob`; in `submitPayment` branch accordingly).
2. **IDs from `crypto.randomUUID()`** → wrap as `newId()` in `lib/utils/id.ts` so RN can swap in `expo-crypto`/`react-native-uuid`.
3. **Business rules stay in Postgres**, so RN cannot diverge from web. The only UI-side rule is `termUtils.ts` (pure TS — shareable verbatim).
4. **Deep links:** notification rows carry `type` + `data` (IDs) in addition to the web `action_url`. Put a single pure function `notificationTarget(n): { screen: string; params: object }` in the shared code; web maps it to routes, RN to navigation screens.
5. **Auth redirects:** register `fairybread://auth/callback` in Supabase Auth redirect URLs now; use it for RN reset/confirm flows.
6. **Monorepo when RN starts** (npm workspaces): `packages/core` (types, `lib/data`, `termUtils`, `qk`, errors, `notificationTarget`, hooks), `apps/web` (this app), `apps/mobile` (Expo). Moving files is mechanical if rules 1–4 are followed.

**RN specifics (for the later build):**

| Concern | Choice |
|---|---|
| Supabase client | `createAppSupabase(url, key, { storage: AsyncStorage, detectSessionInUrl: false })` + `AppState` listener calling `supabase.auth.startAutoRefresh()/stopAutoRefresh()` |
| Push | `@react-native-firebase/messaging` (gives a real FCM token on iOS and Android) → `dataClient.registerDevice(token, Platform.OS)`; request permission with a pre-prompt screen; handle `onTokenRefresh` → re-register; `messaging().onNotificationOpenedApp / getInitialNotification` → `notificationTarget()` |
| Android | Create notification channel `default` (the Edge Function sends `channel_id: 'default'`); Android 13+ needs `POST_NOTIFICATIONS` runtime permission |
| iOS | APNs auth key (.p8) uploaded in Firebase; Push Notifications + Background Modes capabilities; **account deletion in-app** (`deleteMyAccount`) is mandatory for App Store review |
| Uploads | `expo-image-picker`/`expo-document-picker` → `fetch(uri).then(r => r.blob())` → same `submitPayment` path |
| Realtime | same `supabase.channel(...)` code |
| OTP auth | `signInWithOtp` / `verifyOtp` / `updateUser` work unchanged in RN, and a typed code needs **no deep link**, which makes OTP the easier option on mobile |
| Shop | portal checkout reuses `place_portal_order` + the `shop-receipts` bucket as-is; guest checkout is a web-only concern unless the app gains a signed-out mode |
| Payments | stays manual bank transfer (no IAP concerns, since it is a real-world tutoring service, not digital goods — confirm with App Store guidelines at submission time) |

Nothing in `SUPABASE_SCHEMA.md` needs to change for mobile.

---

<a id="13-go-live"></a>
## 13. Go-live checklist and open items

### 13.1 Checklist

- [ ] Staging and production are **separate** Supabase + Firebase projects.
- [ ] Every migration was applied through the SQL Editor **in order**, ran clean on **dev first**, and is recorded in `MIGRATIONS_LOG.md` for each project.
- [ ] `seed.sql` is **not** run in production; first admin promoted manually (Schema §7 note); real bank details entered in Settings.
- [ ] Email confirmation **on**, custom SMTP, SPF/DKIM set for the sender domain, templates branded.
- [ ] CAPTCHA on signup; leaked-password protection on; redirect URLs restricted to real origins.
- [ ] Vault secrets `push_function_url` / `push_function_secret` created; Edge secrets set; `send-push` deployed with **Verify JWT off**.
- [ ] Storage buckets exist with limits; `payment-proofs` is **private**; verified a parent cannot open another family's file.
- [ ] `select * from v_counter_drift` = 0 rows; add it to a weekly check.
- [ ] PITR backups on; restore drill done once.
- [ ] Hosting: SPA fallback rewrite (`/* → /index.html`), correct `Content-Type` for `/firebase-messaging-sw.js`, HTTPS only, CSP allowing `*.supabase.co`, `*.googleapis.com`, `www.gstatic.com`.
- [ ] Legal: privacy policy mentions payment-record retention and push notifications; real T&Cs uploaded via Admin → Settings (enrolment step 3 links to them).
- [ ] `check:no-mock` script passes in CI; `dist/` contains no `service_role`.
- [ ] OTP: the three email templates print `{{ .Token }}`; OTP length 6 / expiry 600 s; `max_frequency` ≥ the UI resend timer; custom SMTP verified end-to-end to Gmail/Outlook/iCloud.
- [ ] Shop & guest checkout: complete §14.10.

### 13.2 Decisions that are still the client's (kept configurable, marked `TODO: confirm with client`)

1. Individual-class price (assumed $50) and assessment price (assumed $50) — `app_settings.pricing`.
2. Registration fee every term vs first term only — `pricing.registration_fee_every_term`.
3. Cancellation window (assumed 24 h) and unverified-payment seat-hold (assumed 72 h) — `term_rules`.
4. Early-renewal behaviour (assumed: new term starts when the current one ends; no rollover).
5. Whether teacher price changes need admin approval, and whether teachers manage availability — currently teachers edit their own classes/prices via RLS.
6. Assessment calendar (days/slots/lead time) — `assessment_booking`.
7. GST on top (as built) — confirm with the accountant.
8. Timezone (assumed `Australia/Sydney`).
9. Retention period for payment records and enrolment signatures.
10. **Shop:** GST/shipping on shop prices (assumed: final price, $0 shipping), COD for guests, who maintains the catalogue/stock, retention of guest-order personal data, and whether guests should get status emails.

### 13.3 Known gaps / nice-to-haves (not in this scope)

- `admin_broadcast` RPC for announcements (insert one `notifications` row per target family through `private.notify_family`).
- Weekly storage cleanup of orphaned proof files whose payment row was never created.
- Email fallback for `payment_approved` / `term_expiring` (Edge Function + Resend) for parents who never enable push.
- Teacher availability feature (`TODO: scope pending client confirmation`).
- Automated pgTAP/Playwright suites (§11.3).

---

<a id="14-shop"></a>
## 14. Learning Shop (portal + public guest checkout)

> Source: `SHOP_AND_AUTH_UPDATES.md` §1–11 and §13–15. Schema: `SUPABASE_SCHEMA.md` §13A.
> The update note says "add all three (interface + mock + supabase) or none". After §10 the mock no longer exists, so the rule becomes **interface + Supabase implementation, always together**.

### 14.1 What the new UI needs from the backend

| UI feature (update note) | Backend piece |
|---|---|
| Product grid with **In / Low / Out of stock** badges, search, category pills | `get_shop_products()` (works signed-out); categories from `shop_categories` |
| Cart (local `useState`, not persisted) | **No backend.** Only `{productId, quantity}` is sent at checkout |
| 4-step portal checkout, COD or Advance + receipt upload | `place_portal_order` RPC + Storage bucket `shop-receipts` |
| 4-step **guest** checkout at `/shop` (no login) | Edge Function `shop-guest-checkout` → `place_guest_order` (service role only) |
| My orders + order detail | `shop_orders` + `shop_order_items` via RLS (`family_id = my family`) |
| Admin: stat cards, *Pending verification* / *All orders*, Review modal with receipt preview | `admin_shop_stats()`, `shop_orders` (admin RLS), signed receipt URL, `verify_shop_order` |
| Admin: **Receipt** button / `printReceipt(order)` | Client-only (§14.7 — must be HTML-escaped) |
| Order status badges (`Pending/Processing/Shipped/Delivered`) | `admin_update_shop_order_status` — **new admin controls required** (the update note has no way to advance a status) |
| Product catalogue | **New admin page required** (§14.6) — the note only has mock products |

### 14.2 Types v2 (`src/types/shop.ts`)

Same shape idea as the update note, but money in cents, the human order number added, nullable `family_id`, and the new statuses.

```ts
export type ShopProduct = {
  id: string; title: string; category: string; description: string; details: string;
  price_cents: number;
  image_url: string | null;                       // null → render the existing gradient-initials <ProductImage/>
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
};
export type ShopCartItem = { product: ShopProduct; quantity: number };           // local UI state only

export type ShopOrderItem = { product_id: string | null; title: string; unit_price_cents: number; quantity: number };
export type ShopOrder = {
  id: string;                                      // uuid (key)
  order_number: string;                            // 'FBO-1001' (what the UI shows as "Order ID")
  family_id: string | null;                        // null for guests; the mapper may expose 'guest' for legacy UI checks
  family_name?: string;                            // = customer_name
  source: 'portal' | 'guest';
  items: ShopOrderItem[];
  subtotal_cents: number; shipping_cents: number; total_cents: number;
  status: 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled';
  payment_method: 'cod' | 'advance';
  payment_status: 'unpaid' | 'pending_verification' | 'paid' | 'refunded';
  receipt_filename?: string; review_note?: string;
  delivery_name: string; delivery_address: string; delivery_phone: string; delivery_email?: string;
  created_at: string;
};

export type PlaceOrderInput = {
  orderId: string;                                 // generated ONCE per checkout session (useRef(crypto.randomUUID())) → idempotent retries
  source: 'portal' | 'guest';
  items: Array<{ productId: string; quantity: number }>;
  paymentMethod: 'cod' | 'advance';
  delivery: { name: string; address: string; phone: string; email: string };
  receipt?: File | null;                           // KEEP THE File — the mock only kept its filename
  captchaToken?: string;                           // guest only
};
export type PlacedOrder = { id: string; order_number: string; total_cents: number };

export type ShopStats = { total_orders: number; pending_verification: number; revenue_cents: number; low_stock_products: number };
export type AdminShopProduct = ShopProduct & { stock_quantity: number; low_stock_threshold: number; is_active: boolean; sort_order: number };
export type ShopProductInput = Partial<Omit<AdminShopProduct, 'status' | 'image_url'>> & { image_path?: string | null };
```

### 14.3 `DataClient` additions (replace the five stubs from the update note)

```ts
// ── Learning Shop ──────────────────────────────────────
getShopProducts(): Promise<ShopProduct[]>;                              // callable signed-out
getShopOrders(familyId: string): Promise<ShopOrder[]>;                  // familyId kept for query-key parity; RLS is the real filter
getAllShopOrders(opts?: { limit?: number; offset?: number }): Promise<ShopOrder[]>;   // admin; paginate (default 50)
getShopStats(): Promise<ShopStats>;                                     // admin
placeOrder(input: PlaceOrderInput): Promise<PlacedOrder>;               // BREAKING vs the note: one object arg; familyId/familyName dropped
verifyShopOrder(orderId: string, action: 'approve' | 'reject', note?: string): Promise<void>;
updateShopOrderStatus(orderId: string, status: ShopOrder['status'], note?: string): Promise<void>;   // admin
getShopReceiptUrl(orderId: string): Promise<string | null>;             // short-lived signed URL (admin or owning family)
getAdminShopProducts(): Promise<AdminShopProduct[]>;                    // admin: includes stock + inactive
upsertShopProduct(p: ShopProductInput): Promise<AdminShopProduct>;
uploadShopProductImage(productId: string, file: File): Promise<string>;  // returns image_path
```

| Method | Supabase call |
|---|---|
| `getShopProducts` | `rpc get_shop_products` → map `image_path` → `sb.storage.from('shop-products').getPublicUrl(path).data.publicUrl`; `price_cents` as-is |
| `getShopOrders` | `from('shop_orders').select('*, items:shop_order_items(product_id,title,unit_price_cents,quantity)').eq('family_id', id).order('created_at', {ascending:false})` |
| `getAllShopOrders` | same without the filter + `.range(offset, offset+limit-1)` |
| `getShopStats` | `rpc admin_shop_stats` |
| `placeOrder` | §14.5 |
| `verifyShopOrder` | `rpc verify_shop_order({ p_order_id, p_action, p_note })` |
| `updateShopOrderStatus` | `rpc admin_update_shop_order_status({ p_order_id, p_status, p_note })` |
| `getShopReceiptUrl` | read `receipt_path` from the order row, then `storage.from('shop-receipts').createSignedUrl(path, 300)` |
| `getAdminShopProducts` | `from('shop_products').select('*').order('sort_order')` (admin RLS) |
| `upsertShopProduct` | `from('shop_products').upsert(snake(p))` (column grants limit what can be written; `status` is generated) |
| `uploadShopProductImage` | `storage.from('shop-products').upload('{id}/{Date.now()}-{safeName}', file)` → set `image_path` via `upsertShopProduct` |

**Query keys** (add to `qk`): `shopProducts: ['shopProducts']`, `shopOrders: (familyId) => ['shopOrders', familyId]`, `allShopOrders: (page?) => ['allShopOrders', page ?? 0]`, `shopStats: ['shopStats']`, `adminShopProducts: ['adminShopProducts']`. These match the keys the update note already uses (`['shopOrders', familyId]`, `['allShopOrders']`).

**Invalidation:**

| Mutation | Invalidate |
|---|---|
| `placeOrder` | `shopOrders(familyId)`, `shopProducts` (stock changed), `adminShopProducts`, `shopStats`, `notifications` |
| `verifyShopOrder`, `updateShopOrderStatus` | `allShopOrders`, `shopStats`, `shopOrders` (prefix, all families), `notifications` |
| `upsertShopProduct`, `uploadShopProductImage` | `shopProducts`, `adminShopProducts` |

### 14.4 Edge Function `shop-guest-checkout` (the only door for anonymous orders)

Deploy via the dashboard (§7 intro) with **Verify JWT off**.
Secrets (Edge Functions → Secrets): `IP_HASH_SALT` (long random string), optional `TURNSTILE_SECRET`, optional `RESEND_API_KEY` + `MAIL_FROM` (order-confirmation email). `SUPABASE_URL` / `SERVICE_ROLE_KEY` are injected.

```ts
// supabase/functions/shop-guest-checkout/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};   // inlined: the dashboard editor deploys a single file and cannot resolve '../_shared/…'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SALT = Deno.env.get('IP_HASH_SALT') ?? '';
const TURNSTILE = Deno.env.get('TURNSTILE_SECRET');
const RESEND = Deno.env.get('RESEND_API_KEY');
const MAIL_FROM = Deno.env.get('MAIL_FROM');
const MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[a-z_]{3,40}$/;                                  // only pass through our own error codes

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function ipHash(req: Request) {
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + ip));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function captchaOk(token?: string) {
  if (!TURNSTILE) return true;                                   // CAPTCHA not configured
  if (!token) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body: new URLSearchParams({ secret: TURNSTILE, response: token }) });
  return (await r.json()).success === true;
}

async function emailConfirmation(orderId: string) {
  if (!RESEND || !MAIL_FROM) return;
  const { data: o } = await sb.from('shop_orders').select('*, items:shop_order_items(*)').eq('id', orderId).single();
  const { data: pub } = await sb.from('app_settings').select('value').eq('key', 'public_info').single();
  if (!o?.delivery_email) return;
  const money = (c: number) => `$${(c / 100).toFixed(2)}`;
  const rows = o.items.map((i: any) => `<tr><td>${esc(i.title)}</td><td>${i.quantity}</td><td>${money(i.unit_price_cents * i.quantity)}</td></tr>`).join('');
  const html = `<h2>Thanks, ${esc(o.delivery_name)}!</h2><p>We received order <b>${esc(o.order_number)}</b>.</p>
    <table cellpadding="6">${rows}</table><p><b>Total ${money(o.total_cents)}</b></p>
    <p>${o.payment_method === 'advance' ? 'We will verify your bank transfer and email you when your order is on its way.' : 'You will pay cash on delivery.'}</p>
    <p>Questions? ${esc(pub?.value?.contact_email ?? '')}</p>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: o.delivery_email, subject: `Order ${o.order_number} received`, html }),
  });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (Number(req.headers.get('content-length') ?? 0) > 50_000) return json({ error: 'invalid_input' }, 413);

  const body = await req.json().catch(() => null);
  if (!body || typeof body.orderId !== 'string' || !UUID.test(body.orderId)) return json({ error: 'invalid_input' }, 400);
  const hash = await ipHash(req);

  // ── 1) one-shot signed upload URL for the bank-transfer receipt ───────────────
  if (body.action === 'upload_url') {
    const { data: ok } = await sb.rpc('check_rate_limit', { p_bucket: 'guest_upload', p_key: hash, p_max: 10, p_window_seconds: 3600 });
    if (!ok) return json({ error: 'rate_limited' }, 429);
    if (!MIME.includes(body.contentType)) return json({ error: 'invalid_input' }, 400);
    const safe = String(body.filename ?? 'receipt').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const path = `guest/${body.orderId}/${safe}`;                 // the RPC re-checks this exact prefix
    const { data, error } = await sb.storage.from('shop-receipts').createSignedUploadUrl(path);
    if (error || !data) return json({ error: 'upload_failed' }, 500);
    return json({ path: data.path, token: data.token });
  }

  // ── 2) place the order ────────────────────────────────────────────────────────
  if (body.action === 'place') {
    if (!(await captchaOk(body.captchaToken))) return json({ error: 'captcha_failed' }, 400);
    const { data: ok } = await sb.rpc('check_rate_limit', { p_bucket: 'guest_order', p_key: hash, p_max: 8, p_window_seconds: 3600 });
    if (!ok) return json({ error: 'rate_limited' }, 429);
    if (!Array.isArray(body.items) || body.items.length > 50) return json({ error: 'invalid_input' }, 400);

    const { data, error } = await sb.rpc('place_guest_order', {
      p_id: body.orderId,
      p_items: body.items.map((i: any) => ({ product_id: i.productId, quantity: i.quantity })),
      p_method: body.paymentMethod,
      p_delivery: body.delivery,
      p_receipt_path: body.receiptPath ?? null,
      p_receipt_filename: body.receiptFilename ?? null,
      p_ip_hash: hash,
    });
    if (error) {
      const code = CODE.test(error.message) ? error.message : 'unknown';
      return json({ error: code }, code === 'rate_limited' ? 429 : 400);
    }
    try { await emailConfirmation(body.orderId); } catch (e) { console.error('confirmation email failed', e); }   // never fail the order because of email
    return json({ order: data });
  }
  return json({ error: 'invalid_input' }, 400);
});
```

Why this shape: the browser never gets a write grant; the DB (not the function) is the final authority on prices, stock, receipt-path prefix, and the per-IP limit; the function only adds CAPTCHA, IP hashing, signed upload URLs and email. CAPTCHA is checked on `place` only (Turnstile tokens are single-use); the upload step is protected by the rate limit plus the bucket's size/MIME limits.

### 14.5 Client implementation of `placeOrder`

```ts
// src/lib/data/supabase/shop.ts (excerpt)
const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
const alreadyExists = (m?: string) => /already exists|duplicate/i.test(m ?? '');     // retry after a half-finished attempt

async placeOrder(input) {
  if (input.paymentMethod === 'advance') {
    if (!input.receipt) throw new AppError('proof_missing', COPY.proof_missing);
    const bad = validateProof(input.receipt);                                          // §6.1: type + 10 MB
    if (bad) throw new AppError('invalid_input', bad);
  }
  return input.source === 'guest' ? placeGuest(sb, input) : placePortal(sb, input);
}

async function placePortal(sb: AppSupabase, input: PlaceOrderInput): Promise<PlacedOrder> {
  const ctx = await rpc<{ family_id: string }>(sb, 'get_my_context');                   // family comes from the session, never from the UI
  let path: string | null = null;
  if (input.paymentMethod === 'advance') {
    path = `${ctx.family_id}/${input.orderId}/${safeName(input.receipt!.name)}`;       // must match the Storage RLS + the RPC's LIKE check
    const up = await sb.storage.from('shop-receipts').upload(path, input.receipt!, { contentType: input.receipt!.type, upsert: false });
    if (up.error && !alreadyExists(up.error.message)) throw toAppError(up.error);
  }
  const o = await rpc<any>(sb, 'place_portal_order', {
    p_id: input.orderId,
    p_items: input.items.map(i => ({ product_id: i.productId, quantity: i.quantity })),
    p_method: input.paymentMethod, p_delivery: input.delivery,
    p_receipt_path: path, p_receipt_filename: input.receipt?.name ?? null,
  });
  return { id: o.id, order_number: o.order_number, total_cents: o.total_cents };
}

async function placeGuest(sb: AppSupabase, input: PlaceOrderInput): Promise<PlacedOrder> {
  let receiptPath: string | undefined;
  if (input.paymentMethod === 'advance') {
    const f = input.receipt!;
    const { path, token } = await callGuest(sb, { action: 'upload_url', orderId: input.orderId, filename: f.name, contentType: f.type });
    const up = await sb.storage.from('shop-receipts').uploadToSignedUrl(path, token, f, { contentType: f.type });
    if (up.error && !alreadyExists(up.error.message)) throw toAppError(up.error);
    receiptPath = path;
  }
  const { order } = await callGuest(sb, {
    action: 'place', orderId: input.orderId, items: input.items, paymentMethod: input.paymentMethod,
    delivery: input.delivery, receiptPath, receiptFilename: input.receipt?.name, captchaToken: input.captchaToken,
  });
  return { id: order.id, order_number: order.order_number, total_cents: order.total_cents };
}

async function callGuest(sb: AppSupabase, body: Record<string, unknown>) {
  const { data, error } = await sb.functions.invoke('shop-guest-checkout', { body });
  if (error) {                                                                          // FunctionsHttpError → read our { error: code }
    const j = await (error as any).context?.json?.().catch(() => null);
    throw toAppError({ message: j?.error ?? error.message });
  }
  return data;
}
```

**Idempotency:** the checkout modal holds `const orderId = useRef(crypto.randomUUID())` and regenerates it only after a **successful** order. A double-click, a retry after a network drop, or React Query retry all reuse the same id → the DB returns the existing order, never a duplicate.

### 14.6 Page-by-page changes for the shop

| File | Required change |
|---|---|
| `types/shop.ts` | Replace with §14.2. |
| `LearningShopPage.tsx` | `useQuery(qk.shopProducts, dataClient.getShopProducts)`. Prices via `formatMoney(price_cents)`. `Out of Stock` → disabled button (server re-checks). Clamp cart quantity to `settings.shop.max_qty_per_line`. **Checkout:** keep the `File` in state (not just `receiptFilename`); `orderId = useRef(crypto.randomUUID())`; map cart → `items: cart.map(c => ({ productId: c.product.id, quantity: c.quantity }))`; call `placeOrder({ source:'portal', … })` (no `familyId`/`familyName`). Prefill delivery name/phone/address from `getFamily`. Bank card ← `settings.public_info.bank`; transfer reference ← `${family.reference_code}-SHOP`. Show shipping line only if `settings.shop.shipping_cents > 0`. `onError` → `toAppError(e).message` (e.g. `out_of_stock` → also `invalidateQueries(qk.shopProducts)`). Success toast shows `order_number`. |
| `MyOrdersPage.tsx` | `getShopOrders(familyId)`; show `order_number`; add `Cancelled` and `refunded` badge styles; in `OrderDetailModal` show `review_note` when a payment was rejected. Realtime already refreshes it when a `shop_*` notification arrives (§14.8). |
| `AdminOrdersPage.tsx` | Stat cards ← `getShopStats()` (don't compute from the list — the list is paginated). List ← `getAllShopOrders({ limit: 50, offset })` + "Load more". Tabs filter client-side on the loaded page, or add a `paymentStatus` filter param to the method. **Review modal:** receipt preview via `getShopReceiptUrl(order.id)` (`<img>` for images, link for PDF); Approve → `verifyShopOrder(id,'approve')`; Reject requires a note → `verifyShopOrder(id,'reject',note)`. **New "Update status" control** (select limited to valid next states: `Pending→Processing/Cancelled`, `Processing→Shipped/Cancelled`, `Shipped→Delivered`); *Cancel* shows a confirm: "Stock will be returned. If this order was paid, you must refund the customer manually." For **guest** rows show a `mailto:` link (they have no portal notifications). `printReceipt` → §14.7. |
| **`AdminShopProductsPage.tsx` (NEW, required)** | Route `/admin/shop-products`, nav label **Shop products** (Package icon). Table: title, category, price, stock, derived status, active toggle. Create/edit modal (zod: title 1–200, price ≥ 0, stock ≥ 0, threshold ≥ 0, category from `shop_categories`), image upload (`uploadShopProductImage`, ≤ 5 MB, JPG/PNG/WebP). Uses `getAdminShopProducts` / `upsertShopProduct`. Without this page the catalogue can only be edited in Supabase Studio. |
| `ShopPage.tsx` (public) | Same product query (works signed-out because `get_shop_products` is granted to `anon`). Guest modal: step 2 validates email with the same zod email schema. Optional CAPTCHA: render Cloudflare Turnstile with `VITE_TURNSTILE_SITE_KEY`, pass `captchaToken` (allow `https://challenges.cloudflare.com` in CSP). Handle `rate_limited` / `guest_checkout_disabled` / `out_of_stock` with friendly copy. Success screen shows `order_number` + the email used. If `useAuth().user` exists, replace the "Already a family? Sign in" upsell with **"Go to your portal shop"** → `/parent/shop`. Bank details from `settings.public_info` (anon-readable). |
| `useAppSettings` | Must tolerate **anonymous** callers: RLS returns only `is_public` rows (`public_info`, `shop`), so type the result as `Partial<AppSettings>` and don't assume `pricing`/`business` exist. |
| `router.tsx` | `{ path: '/shop', element: <PublicShopPage/> }` stays **outside** every `RequireRole` wrapper; `/parent/shop`, `/parent/orders` go inside the parent guard; `/admin/orders`, `/admin/shop-products` inside the admin guard; `/forgot-password` public. |
| `ParentLayout.tsx` / `AdminLayout.tsx` | Nav items as in the note + **Shop products** (admin). Optional: badge on *Shop orders* = `getShopStats().pending_verification`. |
| `LandingPage.tsx` | Replace `<a href="/shop">` with `<Link to="/shop">` to avoid a full reload. No backend change. |
| `AdminSettingsPage.tsx` | Bank + contact details now edit `public_info`; shop rules (`shipping_cents`, COD/advance/guest toggles, `advance_hold_days`) edit `shop` via `updateSetting` (an "Ask first" area — confirm dialog). Add the **Shop orders** notification toggle (category `orders`). |

### 14.7 `printReceipt(order)` — fix a stored-XSS hole before it ships

The update note says the receipt opens a new tab with generated HTML. Order fields (`delivery_name`, `delivery_address`, item `title`s) are **typed by anonymous guests** and then rendered into an **admin's** browser; unescaped, `<img src=x onerror=…>` in an address field would run in the admin's session.

```ts
// src/features/admin/lib/printReceipt.ts
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function printReceipt(order: ShopOrder, contactEmail: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.opener = null;
  const rows = order.items.map(i =>
    `<tr><td>${esc(i.title)}</td><td>${esc(i.quantity)}</td><td>${esc(formatMoney(i.unit_price_cents * i.quantity))}</td></tr>`).join('');
  w.document.open();
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Receipt ${esc(order.order_number)}</title>
    <h1>Receipt ${esc(order.order_number)}</h1>
    <p>${esc(new Date(order.created_at).toLocaleString('en-AU'))} · ${esc(order.payment_method)} · ${esc(order.payment_status)}</p>
    <p><b>${esc(order.delivery_name)}</b><br>${esc(order.delivery_address)}<br>${esc(order.delivery_phone)}<br>${esc(order.delivery_email)}</p>
    <table border="1" cellpadding="6">${rows}</table><p><b>Total ${esc(formatMoney(order.total_cents))}</b></p>
    <p>${esc(contactEmail)}</p>`);
  w.document.close(); w.focus(); w.print();
}
```

Rules: **every** dynamic value goes through `esc()`; the contact email comes from `settings.public_info.contact_email`, not a literal. (A cleaner long-term option is a printable React route `/admin/orders/:id/receipt` with `@media print` — React escapes by default and there is no `document.write`.) Admin table/modals already render through React, which escapes automatically; never use `dangerouslySetInnerHTML` for order data.

### 14.8 Notifications from the shop

Created by the database (Schema §13A) — the frontend never creates them. They flow through the same pipeline as everything else: in-app row → Realtime → FCM push (§8).

| Event | Recipient | `type` | Deep link |
|---|---|---|---|
| Any new order (portal or guest) | all admins | `shop_order_received` | `/admin/orders` |
| Bank transfer verified | the family (portal only) | `shop_payment_approved` | `/parent/orders` |
| Bank transfer rejected | the family | `shop_payment_rejected` | `/parent/orders` |
| Shipped / Delivered / Cancelled (incl. auto-cancel) | the family | `shop_order_update` | `/parent/orders` |

Guests have no profile, so they receive **no push/in-app**; they get the on-screen order number and (if `RESEND_API_KEY` is configured) a confirmation email. Approve/reject/ship updates for guests are a manual `mailto:` from the admin screen until you add an email-on-status-change function (see §14.9).

In `useRealtime` (§9.3) add the shop types to the invalidation list so open screens refresh:

```ts
if (n.type.startsWith('shop_')) {
  qc.invalidateQueries({ queryKey: ['shopOrders'] }); qc.invalidateQueries({ queryKey: ['allShopOrders'] }); qc.invalidateQueries({ queryKey: qk.shopStats });
}
```

Preference UI: add **Shop orders** (`orders`) to the notification-preference toggles (admin settings and the parent bell drawer).

### 14.9 Guest checkout: risks, mitigations and open items

| Risk | Mitigation built in | Residual / to decide |
|---|---|---|
| Bot floods orders | Turnstile on `place`, `check_rate_limit` (8/h/IP-hash), per-IP cap inside the RPC (`guest_orders_per_ip_hour`), item/qty caps | Enable Turnstile before launch |
| **Fake COD orders hold stock** | Admin can cancel (returns stock); rate limits | Consider a `guest_cod_enabled` setting (guests must prepay) if abused |
| Upload abuse (storage fill) | Bucket 10 MB + MIME allow-list; signed URL is for one exact path; 10 uploads/h/IP | Weekly cleanup of `guest/` objects whose order id doesn't exist (small Edge Function + cron) |
| Price/stock tampering | Prices, totals, stock all read inside the transaction; unknown/inactive products rejected | — |
| Enumeration of other people's orders | Anon has no table/RPC access; function returns only `{id, order_number, total, status}`; ids are UUIDs | — |
| PII retention (name, address, phone, email without an account) | — | Decide a retention period; delete/anonymise guest orders after it; mention in the privacy policy |
| Guest status emails | Optional Resend confirmation on placement | Add a `shop-order-email` function (called from the admin UI after approve/ship) if the client wants it |
| Rejected advance order re-submission | Order stays `Pending/unpaid`, auto-cancelled after `advance_hold_days` | UI to *re-upload proof* is not in the update note; today the customer must place a new order |
| Shipping fee / GST | `shop.shipping_cents` (default 0), prices treated as final | `TODO: confirm with client` |

### 14.10 Shop go-live additions

- [ ] Migrations `0012a`, `0012b`, `0013` applied; `select * from public.shop_products` returns the real catalogue (not the seed placeholders).
- [ ] Buckets `shop-receipts` (**private**) and `shop-products` (public) exist; a parent cannot open another family's receipt; anon cannot list either bucket.
- [ ] `shop-guest-checkout` deployed with **Verify JWT off**; secrets set (`IP_HASH_SALT`, `TURNSTILE_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`); `SPF/DKIM` for the sender domain.
- [ ] `public_info` bank + contact details are the real ones; `shop` rules reviewed with the client.
- [ ] Verified from a signed-out browser: `select` on `shop_orders` and `rpc place_guest_order` both fail; only `get_shop_products` works.
- [ ] `printReceipt` escaping verified with a hostile name like `<img src=x onerror=alert(1)>`.

---

### Appendix A — one-glance flow: "Parent books a class by credit"

```
BookClassPage "Confirm"
  → useMutation(() => dataClient.bookClassSession(childId, sessionId))
  → supabase.rpc('book_class_session')                                    [Postgres, one transaction]
       lock session → lock term → checks (enrolled? running term? credits? seats? duplicate? starts later?)
       insert booking · booked_count+1 · classes_booked+1 · ledger −1
       private.notify_family(...) + private.notify_teacher(...)           → notifications rows
          └─ AFTER INSERT trigger → pg_net → send-push → FCM → parent's & teacher's devices
  ← returns booking                                                       [or raises 'no_credits' | 'class_full' | …]
  → onSuccess: invalidate bookings / terms / sessions / notifications     → meter 3→2 on every screen
  → onError: toAppError(e).message shown inline
  Realtime INSERT on notifications → bell + toast (any open tab/device)
```

### Appendix B — one-glance flow: "Admin approves a term payment"

```
AdminPaymentsPage "Approve"
  → dataClient.verifyPayment(id,'approve')  → rpc verify_payment           [admin only]
       payments.status = 'paid' → apply_paid_payment: terms insert (10 credits, 10 weeks) + ledger grant
       notify_family('payment_approved')  → push + in-app
  → invalidate allPayments / terms / adminStats
Parent device: push arrives → tap → /parent/payments; Realtime refreshes terms → gating becomes ACTIVE_TERM
```
