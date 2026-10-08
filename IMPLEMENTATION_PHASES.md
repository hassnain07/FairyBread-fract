# Fairybread & Fractions — Implementation Phases

> **Purpose.** Break the whole backend build into small, ordered, testable phases that you (or your coding agent) can run one at a time.
> **Source documents** (keep all three open):
> - `SUPABASE_SCHEMA.md` → "**Schema §n**" (all SQL, seed, verification)
> - `BACKEND_IMPLEMENTATION.md` → "**Backend §n**" (frontend wiring, Edge Functions, FCM, shop, OTP, mock removal)
> - `SHOP_AND_AUTH_UPDATES.md` → your update note (Learning Shop, guest checkout, OTP auth)
>
> **Environment.** Hosted Supabase only — Dashboard + SQL Editor. **No Docker, no CLI, no local stack.** The only local process is `npm run dev`.
> **This file replaces the earlier agent-generated phase plan.** That plan applied migrations 0001–0003 in Phase 0 and jumped to 0012a/0012b/0013 in Phase 1; migrations **0004–0011 would never have been applied** and the shop migration would have failed. The order below is the corrected one.

---

## 0. Overview

### 0.1 Phase map

| # | Phase | Size | Mostly… | Result you can see |
|---|---|---|---|---|
| 0 | Hosted project & repo foundation | S | Dashboard + files | Dev project configured; SQL files ready in the repo |
| 1 | Database core (migrations 0001–0011) | M | SQL Editor | Full schema, RLS, RPCs, cron live on dev |
| 2 | Shop + OTP hygiene (0012a/b, 0013), seed, DB acceptance | M | SQL Editor | Seeded world; database proven correct **before** any UI work |
| 3 | Client foundation | S | Frontend (no UI change) | Supabase client, errors, keys, money util; app still runs on mock |
| 4 | Authentication (real login, OTP signup, forgot password) | M–L | Frontend | Real sign-in for every role; DemoBar gone |
| 5 | Parent: children, enrolment, class booking (credit loop) | L | Frontend | Parents book/cancel with real credits |
| 6 | Money loop: payments, proof upload, admin verification | L | Frontend | Term purchase → admin approves → credits appear |
| 7 | Teaching loop: teacher portal, attendance, assessments, reports | L | Frontend | Teachers run classes; parents read reports |
| 8 | Admin operations & settings | M–L | Frontend + 1 Edge Function | Admin runs the centre without touching SQL |
| 9 | Messaging & real-time in-app notifications | M | Frontend | Live chat, bell, toasts |
| 10 | FCM push notifications | M | Firebase + Edge Function + frontend | Real push on desktop/Android browsers |
| 11 | Learning Shop (portal, admin, public guest checkout) | L | Frontend + 1 Edge Function | Shop live for parents and guests |
| 12 | Mock removal & hardening | M | Cleanup + testing | Zero mock code; full acceptance matrix green |
| 13 | Production launch (+ React Native hand-off) | M | Dashboard + hosting | Real families can use it |

Sizes are relative effort (S < M < L), not calendar time.

### 0.2 Dependencies and what can run in parallel

```
0 ─► 1 ─► 2 ─► 3 ─► 4 ─┬─► 5 ─► 6 ─┬─► 7 ─┐
                        │           └─► 8 ─┤
                        ├─► 9 (needs 5–6 data to be interesting)
                        ├─► 10 (needs 4 + 9)         ├─► 12 ─► 13
                        └─► 11 (needs 2 + 4; independent of 5–8)  ┘
```

- **Phases 7 and 8** can be done in parallel once Phase 6 is finished.
- **Phase 11 (shop)** only needs the database (Phase 2) and auth (Phase 4); it can start any time after Phase 4 (e.g., while someone else does Phase 5–6).
- **Phase 10 (push)** can start once Phase 4 exists, but is most useful after Phase 9.
- Never start Phase 12 until every feature phase you intend to ship is done.

### 0.3 Working agreements (give these to the coding agent verbatim)

1. **One phase at a time.** Work on a branch `phase-N-short-name`; merge only after every exit criterion is ticked.
2. **Green before done.** `npm run typecheck`, `npm run lint`, `npm run build` must pass at the end of every phase.
3. **Follow `rules.md`.** The "Ask first" items still apply: new dependencies (only `firebase`, in Phase 10), changing prices/business rules, deleting files outside the plan.
4. **SQL discipline.** Every schema change is a numbered file in `supabase/migrations/`, applied through the SQL Editor (wrapped in `begin; … commit;`), logged in `supabase/MIGRATIONS_LOG.md`. **Never edit an applied migration** — add a new one. If a first-run typo is found in a migration from the Schema doc, fix it in the repo file *and* tell the owner so the doc is corrected.
5. **Dev project only.** Seed, resets and experiments happen on `fairybread-dev`. Production is touched only in Phase 13.
6. **No secrets in the browser.** Only `VITE_SUPABASE_URL`, the anon/publishable key and the public Firebase web config may be in `VITE_*` variables. The `service_role` key, the Firebase service-account JSON, `PUSH_WEBHOOK_SECRET`, `IP_HASH_SALT` etc. live only in Edge Function secrets.
7. **One door to the backend.** `supabase.from/rpc/storage/auth/functions/channel` appear only under `src/lib/data/supabase/` and `src/lib/supabase.ts` (Phase 12 greps for this).
8. **Strangler migration.** Until Phase 12 the app runs a *temporary composite client*: `{ ...legacyMock, ...supabaseImpl }`, marked `// TEMP-LEGACY` in `src/lib/data/client.ts`. Each phase moves more methods from mock to Supabase. Pages not yet migrated may show empty data for real users — that is expected until their phase. Do not "fix" them early.
9. **Each page handles loading → error → empty → data**, and every mutation shows `toAppError(e).message` on failure and invalidates the query keys in Backend §3.5.
10. **Stop and report** if an exit criterion fails; do not paper over it by loosening RLS or granting extra privileges.

### 0.4 Definition of Done (every phase)

- [ ] All tasks ticked; exit criteria ticked with evidence (screenshot, query result, or note).
- [ ] typecheck / lint / build green.
- [ ] `MIGRATIONS_LOG.md` updated (if SQL was run).
- [ ] No new `console.log`, no secrets committed, no hard-coded IDs/names introduced.
- [ ] Branch merged; short summary of what changed and what was found.

### 0.5 Decisions the owner must make, and when

(From Backend §13.2 — they're all configurable in `app_settings`, but a phase needs the answer before it can be signed off.)

| Needed by | Decision |
|---|---|
| Phase 6 | Individual-class and assessment price (assumed $50); registration fee every term vs first term; GST on top; cancellation window (assumed 24 h); unpaid-seat hold (assumed 72 h); assessment calendar (days/slots/lead time); early-renewal behaviour |
| Phase 7 | Whether teachers may edit their own class prices/capacity without approval (currently yes, via RLS) |
| Phase 8 | Who maintains tutors/programs/closures; real T&Cs / privacy / trampoline PDFs |
| Phase 11 | Shop: GST and shipping (assumed final price, $0 shipping), COD for guests, who maintains the catalogue/stock, guest-data retention, guest status emails |
| Phase 13 | Retention period for payment records/signatures, real bank details, sender domain, production domain |

---

## Phase 0 — Hosted project & repo foundation `[S]`

**Goal.** A configured, empty dev project and a repo that contains every SQL file ready to paste. No app code changes.
**Depends on.** Nothing.
**Read first.** Backend §2.1–2.3.

### Tasks

- [ ] **0.1 Clean up anything local.** If any earlier attempt created `supabase/config.toml` or installed the CLI: delete `supabase/config.toml`, run `npm remove supabase` (if installed). Docker is not needed.
- [ ] **0.2 Create the project.** Supabase Dashboard → New project `fairybread-dev`, **Sydney (ap-southeast-2)**. Save the database password in a password manager. Turn on 2FA on your Supabase account.
- [ ] **0.3 Extensions.** Database → Extensions: enable `pg_cron`, `pg_net`, `btree_gist` (Backend §2.1 step 1).
- [ ] **0.4 Auth basics** (Backend §2.1 steps 4–5, 8): URL Configuration (Site URL `http://localhost:5173`; redirect URLs `…/login`, `…/reset-password`); Email provider → **Confirm email ON, OTP length 6, OTP expiry 600 s**; minimum password length 8; raise the email-per-hour rate limit while testing.
- [ ] **0.5 Custom SMTP** (step 6). Create a Resend/Postmark/SES account, verify a sender, enter the SMTP details under Auth → SMTP Settings, set the minimum interval between emails to **60 s**. *The built-in sender will not deliver OTP codes to ordinary users.*
- [ ] **0.6 Email templates** (step 7). Create `supabase/templates/otp.html` from Backend §4.5.1 and paste it into **Confirm signup**, **Magic Link** and **Reset Password** (subjects: "Your Fairybread & Fractions code" / "Your password reset code"). Leave **Invite** link-based.
- [ ] **0.7 Test email delivery.** Auth → Users → *Invite user* with a plus-address (`you+smtp@gmail.com`). Confirm the email arrives; then delete that test user.
- [ ] **0.8 Repo scaffolding.** Create the layout from Backend §2.1:
  `supabase/migrations/`, `supabase/functions/`, `supabase/templates/`, `supabase/tests/`, `supabase/MIGRATIONS_LOG.md`.
- [ ] **0.9 Extract the SQL into files.** Copy each block into its own file, exactly as written:

  | File | Source |
  |---|---|
  | `migrations/0001_foundation.sql` | Schema §3 |
  | `migrations/0002_tables.sql` | Schema §4 |
  | `migrations/0003_settings.sql` | Schema §5 |
  | `migrations/0004_helpers.sql` | Schema §6 |
  | `migrations/0005_auth_triggers.sql` | Schema §7 |
  | `migrations/0006_rpc_business.sql` | Schema §8 (incl. `admin_mark_enrolled`) |
  | `migrations/0007_rpc_comms.sql` | Schema §9 (incl. the `classes_after_update` / `classes_after_insert` triggers) |
  | `migrations/0008_rls.sql` | Schema §10 |
  | `migrations/0009_grants.sql` | Schema §11 |
  | `migrations/0010_views_storage_realtime.sql` | Schema §12 |
  | `migrations/0011_cron.sql` | Schema §13 (not §13.1 — Vault secrets are run by hand later) |
  | `migrations/0012a_shop_enums.sql` | Schema §13A "0012a" |
  | `migrations/0012b_shop.sql` | Schema §13A "0012b" (tables, settings, functions, RLS/privileges, storage, cron) |
  | `migrations/0013_auth_otp_hygiene.sql` | Schema §13B |
  | `seed.sql` | Schema §14 |
  | `dev_reset.sql` | Schema §14.1 |

- [ ] **0.10 Environment files.** `.gitignore` must contain `.env`, `.env.*.local`. Create `.env.example` (Backend §2.2) and `.env.local` with the dev **Project URL** and **anon/publishable key** (Project Settings → API). Add typed entries for `VITE_SUPABASE_*` / `VITE_FIREBASE_*` to `src/vite-env.d.ts`. Leave Firebase/Turnstile values empty.
- [ ] **0.11 Placeholder types.** Make sure `src/lib/data/supabase/database.types.ts` exports `export type Database = any;` (generated types are optional — Backend §2.1).

### Exit criteria

- [ ] Project `fairybread-dev` exists; extensions enabled; Auth settings from 0.4–0.6 saved.
- [ ] A real invite email reached an inbox through your SMTP.
- [ ] All 16 SQL files exist in the repo and match the docs.
- [ ] `.env.local` is git-ignored and contains URL + anon key only.
- [ ] `npm run typecheck && npm run build` still pass; the app still works on the mock.

**Do not** apply any migration yet, install Firebase, or touch components.

---

## Phase 1 — Database core: migrations 0001–0011 `[M]`

**Goal.** The full backend schema running on the dev project: tables, helper functions, auth triggers, business RPCs, messaging RPCs, RLS, privileges, views, storage buckets, realtime publication, cron jobs.
**Depends on.** Phase 0.
**Read first.** Schema §1 (design decisions), §3–§13; Backend §2.1 "Applying a migration".

### Tasks

Apply each file as in Backend §2.1 (SQL Editor → paste → wrap in `begin; … commit;` → nothing highlighted → Run → log it). Take the checkpoints between groups.

- [ ] **1.1 `0001` → `0002` → `0003`** (extensions/enums, tables, default settings).
  *Checkpoint:* Table Editor lists `profiles, families, children, terms, class_bookings, payments, notifications, user_devices …`; `select key from public.app_settings;` returns `pricing, term_rules, business, assessment_booking, session_generation`.
- [ ] **1.2 `0004` → `0005`** (helpers, auth triggers).
  *Checkpoint:* `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private';` lists `is_admin`, `my_family_id`, `notify`, … ; Auth → Users → *Add user* (create + delete a throw-away one) creates a matching row in `profiles` and `families`.
- [ ] **1.3 `0006` → `0007`** (business RPCs; messaging/notification RPCs, dashboard stats, triggers).
- [ ] **1.4 `0008` → `0009`** (RLS, then privileges). Apply them back-to-back; the schema is not safe between them.
- [ ] **1.5 `0010` → `0011`** (views, storage buckets, realtime, cron).
- [ ] **1.6 Data API exposure.** Project Settings → API: *Exposed schemas* must be `public` (+ `graphql_public`) only. **`private` must not be listed** (Backend §2.1 step 3).
- [ ] **1.7 Run the structural checks** below.
- [ ] **1.8 Security Advisor** (Dashboard → Advisors): review every finding; there should be no "RLS disabled" or "exposed schema" errors.

### Structural checks (SQL Editor)

```sql
-- every public table has RLS on  → expect 0 rows
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;

-- anon can read almost nothing → expect only app_settings and documents (SELECT)
select table_name, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and grantee = 'anon' order by 1, 2;

-- anon can execute no functions yet → expect 0 rows
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');

-- buckets
select id, public from storage.buckets order by id;      -- expect documents (public), payment-proofs (private)

-- cron jobs → expect 7
select jobname, schedule, active from cron.job order by jobname;

-- sessions generated for any active class (none yet: expect 0, no error)
select count(*) from public.class_sessions;
```

### Exit criteria

- [ ] Migrations 0001–0011 applied and logged; none edited after being applied.
- [ ] Structural checks return exactly the expected results.
- [ ] Throw-away auth user created a profile + family via the trigger, then was deleted.
- [ ] Security Advisor shows no RLS/exposure errors; `private` not exposed.

**Do not** run the seed yet (it also contains the shop block) and **do not** create Vault secrets yet (Phase 10).

**Gotchas.** If `0001`/`0011` fail on `create extension`/`cron.schedule`, the extension isn't enabled (Phase 0.3). A function referencing a table created later (e.g. `on_class_changed` → `generate_class_sessions`) is fine — plpgsql binds at run time. If you hit a typo, fix the repo file, re-run (the `begin/commit` wrapper left nothing half-applied), and report it.

---

## Phase 2 — Shop & OTP-hygiene migrations, seed, database acceptance `[M]`

**Goal.** Finish the schema (shop, guest-order plumbing, unverified-user purge), load the demo world, and **prove the database is correct before any UI work**. Fixing a rule later in SQL is cheap; fixing it after nine screens depend on it is not.
**Depends on.** Phase 1.
**Read first.** Schema §13A, §13B, §14, §14.1, §15.

### Tasks

- [ ] **2.1 `0012a_shop_enums.sql`** — run on its own, **unwrapped** (four independent statements).
- [ ] **2.2 `0012b_shop.sql`** — wrapped. *Checkpoint:* `select name from public.shop_categories;` → Workbooks, Flash Cards, Activity Kits; `select key, is_public from public.app_settings where is_public;` → `public_info`, `shop`.
- [ ] **2.3 `0013_auth_otp_hygiene.sql`** — wrapped.
- [ ] **2.4 Documents placeholders** (needed by the enrolment page in Phase 5). In Dashboard → Storage → `documents`, upload three placeholder PDFs to `terms/v1.pdf`, `privacy/v1.pdf`, `mini_trampoline/v1.pdf`, then:

  ```sql
  insert into public.documents (key, storage_path, version, original_filename) values
    ('terms',           'terms/v1.pdf',           1, 'terms.pdf'),
    ('privacy',         'privacy/v1.pdf',         1, 'privacy.pdf'),
    ('mini_trampoline', 'mini_trampoline/v1.pdf', 1, 'mini-trampoline.pdf')
  on conflict (key) do nothing;
  ```
- [ ] **2.5 Seed.** Run `seed.sql` as **one** SQL Editor query. *Checkpoint:*
  `select email, role from public.profiles order by role, email;` → 1 admin, 2 teachers, 4 parents; `select count(*) from public.shop_products;` → 6; `select count(*) from public.shop_orders;` → 3.
- [ ] **2.6 Re-run the structural checks.** Now `anon` may `SELECT` `shop_categories` and may execute **only** `get_shop_products` (re-run the three queries from Phase 1; cron jobs now **10**).
- [ ] **2.7 Invariants** — Schema §15.1: `select * from public.v_counter_drift;` and the other two → **0 rows**.
- [ ] **2.8 RLS smoke tests** — Schema §15.2, as `sarah@example.com`, then repeat as `admin@fairybread.au`, `jessica@fairybread.au`, and anonymously (`set local role anon`). Record the results.
- [ ] **2.9 Behaviour checks in SQL** — pick the rows of Schema §15.3 you can reproduce with `set_config('request.jwt.claims', …)`: book by credit (f1), `no_credits` (f2), `term_expired` (f3), `no_term_ever` (f4), cancel inside/outside 24 h, `verify_payment` as parent → `forbidden`, order the Out-of-Stock product → `out_of_stock`.
- [ ] **2.10 Purge test.** Create an unverified user (Auth → Users → add user without confirming), then `select private.purge_unverified_users(interval '0 seconds');` → returns ≥ 1 and the user, profile and empty family are gone.
- [ ] **2.11 Reset rehearsal.** Run `dev_reset.sql`, confirm `select count(*) from auth.users;` = 0, run `seed.sql` again. You now know how to get back to a clean world.
- [ ] **2.12 Security Advisor** once more.

### Exit criteria

- [ ] All 14 migrations applied and logged (0001–0011, 0012a, 0012b, 0013); seed loaded; reset + re-seed works.
- [ ] §15.1 invariants return 0 rows; §15.2 RLS results match the expectations written in the Schema doc.
- [ ] Anonymous callers can: read `app_settings` public rows, `shop_categories`, `get_shop_products()` — and nothing else.
- [ ] `sarah@` cannot read other families, `class_rates`, or change her own role; teachers cannot read `families`.

**Do not** start frontend work until these pass. If the DB behaves wrongly, stop and fix it here.

---

## Phase 3 — Client foundation `[S]`

**Goal.** Add the infrastructure every later phase uses, **without changing any screen**. The app keeps running on the mock.
**Depends on.** Phase 2.
**Read first.** Backend §1, §2.3, §3.3–3.6, §14.2 (types), `rules.md`.

### Tasks

- [ ] **3.1 `src/lib/supabase.ts`** — `createAppSupabase(url, key, opts)` factory + the one exported `supabase` instance (Backend §2.3). The only file that reads `import.meta.env` for backend config.
- [ ] **3.2 `src/lib/data/errors.ts`** — `AppError`, the `COPY` table (including shop + OTP codes) and `toAppError` (Backend §3.4).
- [ ] **3.3 `src/lib/data/queryKeys.ts`** — the `qk` factory incl. shop keys (Backend §3.5).
- [ ] **3.4 Utilities:** `lib/utils/money.ts` (`formatMoney(cents)`, `en-AU`/`AUD`), `lib/utils/id.ts` (`newId()` wrapping `crypto.randomUUID()`), `hooks/useAppSettings.ts` (tolerates anonymous callers → `Partial<AppSettings>`).
- [ ] **3.5 New types only** (do not change existing ones yet): `types/auth.ts` (`Role`, `AuthUser`; also fixes the circular `Role` import), `types/shop.ts` (Backend §14.2). Existing entity types change in the phase that migrates them.
- [ ] **3.6 Supabase data-client skeleton:** folder layout from Backend §3.3, `rpc.ts` wrapper, `mappers.ts`, an empty `createSupabaseDataClient(sb)` that returns `{}`.
- [ ] **3.7 Composite client.** In `lib/data/client.ts`: `export const dataClient = { ...legacyMock, ...createSupabaseDataClient(supabase) } as DataClient; // TEMP-LEGACY`. Remove the `VITE_DATA_SOURCE` switch.
- [ ] **3.8 `ErrorBoundary`** around `<AppRouter />` (`phases.md` item 0.7).

### Exit criteria

- [ ] App behaves exactly as before (mock data, DemoBar still present).
- [ ] In the browser console: `supabase.from('app_settings').select('key')` as an anonymous visitor returns only `public_info` and `shop`; `supabase.from('payments').select()` returns an error or empty (proves the anon key + RLS wiring).
- [ ] `grep -rn "TEMP-LEGACY" src` finds exactly one place.
- [ ] typecheck / lint / build green.

---

## Phase 4 — Authentication `[M–L]`

**Goal.** Real accounts: email+password login, OTP signup, OTP password reset, role-guarded routes, sign-out. The mock role-switcher disappears.
**Depends on.** Phase 3 (and Phase 0 SMTP working).
**Read first.** Backend §4.1–4.6, §3.7 (auth rows), Schema §7.

### Tasks

- [ ] **4.1 Supabase auth methods** in `data/supabase/auth.ts`: `signIn`, `requestSignupOtp`, `requestPasswordResetOtp`, `verifyOtp`, `setPassword`, `signOut`, `getMyContext`, `onAuthChange` (Backend §3.7).
- [ ] **4.2 `AuthProvider` / `useAuth`** (Backend §4.1): `user`, `loading`, `role`, `familyId`, `teacherId`, `signIn`, `signOut`, `refresh`; `queryClient.clear()` on sign-out; the auth-event callback stays synchronous (`setTimeout(refresh, 0)`). **Remove** `setRole` / `setFamilyId`.
- [ ] **4.3 Routing.** `RequireRole` wrappers for parent/teacher/admin groups; add `/forgot-password` and `/reset-password` (Backend §4.2). `/shop` is added in Phase 11.
- [ ] **4.4 `LoginPage`.** Delete `MOCK_CREDENTIALS`, fake latency and the demo-credentials box; real `signIn`; redirect by role; generic error "Incorrect email or password"; redirect-if-signed-in **on this page only**.
- [ ] **4.5 `OtpInput`.** Add `onVerify` (async, throws on bad code); remove the hard-coded `123456` and `.otp-demo-hint`; resend timer **60 s**; lock for 30 s after 5 wrong codes.
- [ ] **4.6 `SignupPage`** 4-step flow: Details → `requestSignupOtp` → Verify → `verifyOtp('signup')` → Password → `setPassword` → Done → `/parent`. **No** auth-redirect effect on this page.
- [ ] **4.7 `ForgotPasswordPage`** 4-step flow with `resetPasswordForEmail`; always advance after step 0 (no enumeration); `signOut()` after the password step, then "Sign in now".
- [ ] **4.8 `ResetPasswordPage`** for staff invite links only ("set your password" using the invite session). It can only be end-to-end tested in Phase 8.
- [ ] **4.9 App shell identity.** `AppShell`/layouts take name, initials and workspace label from `useAuth().user`; remove `roleLabels`, `notifTeacherId`, **`DemoBar`** and the unused `onSwitchRole`/`onHome` props; add a **Sign out** action.
- [ ] **4.10 `useNotifications`** minimal rewrite (Backend §9.2) — no ids, query + mutations, refetch on focus. Realtime comes in Phase 9.
- [ ] **4.11 Seeded logins** work for all three roles (admin account is also a teacher).

### Exit criteria (Backend §11.2 rows)

- [ ] **13** — `jessica@` opening `/admin` is redirected to `/teacher`; signed-out users go to `/login`.
- [ ] **15** — signing out and in as another user shows no stale data.
- [ ] **28** — signup with a new plus-address: code arrives, session exists after step 1, profile + family rows exist, lands on `/parent`, **no mid-flow redirect**.
- [ ] **29** — wrong ×5 / expired code / resend gating behave as specified, friendly messages.
- [ ] **30** — forgot password: unknown and known emails look identical; after reset the user must log in.
- [ ] **31** — abandon after step 1, come back, use Forgot password → works.
- [ ] Refreshing the page keeps the session; `DemoBar` and `MOCK_CREDENTIALS` no longer exist (`grep`).

**Expected side effect.** Parent/teacher/admin pages still read the mock keyed to `f1`, `tch1`…; with a real user they show empty or wrong data until their phase. Don't fix them early.

**Gotchas.** OTP verification *creates a session mid-flow* (don't redirect). The Magic-Link template is used when the email already exists, so it must also print `{{ .Token }}`. If no code arrives, check SMTP and the Auth logs before suspecting the code.

---

## Phase 5 — Parent: children, enrolment, class booking `[L]`

**Goal.** The credit loop with real data: a parent sees their children, enrols a child, books and cancels classes; gating is correct for all four seeded families.
**Depends on.** Phase 4.
**Read first.** Backend §3.1–3.2 (family/term/class/booking types), §3.7 (rows for children, terms, sessions, bookings), §5.2 (parent table), Schema §8 (`complete_enrolment`, `book_class_session`, `cancel_booking`).

### Tasks

- [ ] **5.1 Types v2** for `Family`, `Child`, `Term` (exclusive `end_date`, `classes_remaining`), `ClassSlot`, `ClassSession`, `ClassBooking`, `BookingCancelResult` (Backend §3.2). Update every consumer.
- [ ] **5.2 Supabase methods** (move from mock): `getSettings`, `getDocuments`, `getFamily`, `getChildren`, `addChild`, `updateChild`, `completeEnrolment`, `getTerms`, `getTeachers`, `getPrograms`, `getClassSlots`, `getUpcomingSessions`, `getBookings`, `bookClassSession`, `joinWaitlist`, `cancelBooking`, `getGating`.
- [ ] **5.3 Remaining of `config.ts`:** `termUtils` takes the expiry-warning weeks as a parameter from `useAppSettings()`; `TermCreditMeter` shows "ends {end_date − 1 day}". (Price constants are removed in Phase 6.)
- [ ] **5.4 `ParentLayout`**: selected child from real children; no hard-coded names.
- [ ] **5.5 `ChildrenPage` / `ChildProfilePage`:** delete the hard-coded `enrichment` blobs; add-child (given + family name); Goals tab → `updateChild`. Attendance tab stays hidden until Phase 7.
- [ ] **5.6 `EnrolmentPage`:** `completeEnrolment(child.id, …)` in a `useMutation`; **step 5 only in `onSuccess`**; fixes the duplicate-child bug; document links from `getDocuments()`.
- [ ] **5.7 `BookClassPage`:** sessions grouped by class, spaces from `spaces_left`, **FULL → Join waiting list**, credit booking via `bookClassSession`; friendly errors (`class_full`, `no_credits`, `session_outside_term`, `term_expired`, `no_term_ever`); individual-class path just navigates to `/parent/payments` with `{ type, childId, sessionId }` (IDs, not strings). Toggle truly disabled for `NO_TERM_EVER`. Never show `class_rates`.
- [ ] **5.8 `BookingsPage`:** dated bookings; cancel dialog previews the 24 h outcome, the real result comes from the RPC; `pending_payment` and `waiting_list` badges.
- [ ] **5.9 `DashboardPage` (partial):** upcoming classes, sessions this term, credit meter from real data; hide the attendance, tutor-note and progress widgets (they arrive in Phase 7).
- [ ] **5.10 Invalidation** per Backend §3.5 so the credit meter updates on Dashboard, Book-class and Bookings without a reload.

### Exit criteria (Backend §11.2 rows)

- [ ] **1** Sarah's dashboard shows 3/10 credits and real upcoming classes. **2** Booking a class → 2 credits everywhere, no reload. **3** Cancel > 24 h returns the credit; < 24 h doesn't. **4** Enrolling creates **no duplicate child**. **5** Claire (0 credits) blocked in UI *and* by the server. **6** James: credit booking blocked (`term_expired`). **7** Michael: both credit and individual paths blocked (`no_term_ever`).
- [ ] **11** Two browsers race for the capacity-1 Reading class → exactly one succeeds, the other gets `class_full` + waiting-list offer.
- [ ] `select * from public.v_counter_drift;` → 0 rows after the session.
- [ ] No `FAMILY_NAMES`, `enrichment`, or `'f1'` left in the migrated pages.

**Do not** build payment submission here (Phase 6) or attendance/reports (Phase 7).

---

## Phase 6 — Money loop: payments, proof upload, admin verification `[L]`

**Goal.** A family can buy a term / an individual class / an assessment by bank transfer with a real receipt upload; an admin verifies it; the server activates credits or confirms the seat. All prices come from the server.
**Depends on.** Phase 5. Owner decisions from §0.5 (Phase 6 row).
**Read first.** Backend §6, §5.2 (Payments, BookAssessment), §5.3 (admin payments/family booking/parents), Schema §8 (`submit_payment`, `apply_paid_payment`, `verify_payment`, `admin_record_payment`).

### Tasks

- [ ] **6.1 Types v2:** `Payment` (cents, `details`, `review_note`), `PaymentIntent`, `PriceQuote`, `GatingSnapshot`; `Assessment`.
- [ ] **6.2 Supabase methods:** `getPriceQuote`, `getPayments`, `getAllPayments`, `submitPayment`, `getProofUrl`, `verifyPayment`, `adminRecordPayment`, `adminAdjustCredits`, `getAllFamilies`, `createFamily`, `adminMarkEnrolled`, `getAllTerms`, `getAssessments`.
- [ ] **6.3 Shared pieces:** `ProofUpload` + `validateProof` (JPG/PNG/WebP/HEIC/PDF ≤ 10 MB), `usePriceQuote`, payment `id` held in `useRef(newId())` for retry-safety.
- [ ] **6.4 `PaymentsPage` (parent):** price breakdown from `getPriceQuote`; bank card from `settings.public_info.bank`; reference `${reference_code}-TERM|CLASS`; real file input; individual-class intent from navigation state; history with `review_note` on rejection.
- [ ] **6.5 `BookAssessmentPage`:** replace the hard-coded October calendar, "date 13" and "Tuesday 14 October" with a calendar built from `settings.assessment_booking` (+ `closures`); submit as `{ type:'assessment', childId, date, time }`.
- [ ] **6.6 `AdminPaymentsPage`:** list/filter from `getAllPayments`; **View proof** via signed URL; Approve / Reject (reject requires a note).
- [ ] **6.7 `AdminFamilyBookingPage`:** families from `getAllFamilies`; gating from `getGating`; term purchase and individual class via `adminRecordPayment`; credit booking via `bookClassSession`; "Mark as enrolled (paper form)" on `child_not_enrolled`; new family without portal access via `createFamily`. **No client-computed price, no `status:'paid'` from the browser.**
- [ ] **6.8 `AdminParentsPage`:** `getAllFamilies` list (gating state, credits, last payment), detail modal, **Adjust credits** (note required).
- [ ] **6.9 `config.ts`:** delete the price/GST/term constants; remove every `* 1.1` style arithmetic (grep).
- [ ] **6.10 Invalidate** per Backend §3.5 (payments, terms, bookings, assessments, adminStats).

### Exit criteria (Backend §11.2 rows)

- [ ] **8** Michael submits a real receipt → payment `pending`, file in `payment-proofs/{family}/{id}/…`, an admin notification row exists.
- [ ] **9** Admin opens the signed proof and approves → Michael becomes `ACTIVE_TERM` with 10 credits; `payment_approved` notification exists.
- [ ] **10** Approving a second term for Sarah while active → starts at her current `end_date`, status `scheduled`.
- [ ] Double-click / repeated submit with the same id creates **one** payment.
- [ ] Reject path: seat hold released, rejection note visible to the parent.
- [ ] An individual-class payment holds the seat (`pending_payment`); setting `hold_expires_at` in the past and running `select private.release_expired_holds();` frees it.
- [ ] A family with no term ever cannot buy an individual class; an assessment purchase creates an `assessments` row.
- [ ] `grep -rnE "FAMILY_NAMES|TERM_BASE_PRICE|GST_RATE|\* *1\.1" src` → nothing.

---

## Phase 7 — Teaching loop: teacher portal, attendance, assessments, reports `[L]`

**Goal.** Teachers run their classes with real data; attendance and reports persist; parents see published reports and attendance.
**Depends on.** Phase 6 (needs real bookings). Can run in parallel with Phase 8.
**Read first.** Backend §5.2 (Reports, Dashboard, ChildProfile), §5.4 (all teacher pages), Schema §8 (`save_attendance`, `cancel_session`, `deactivate_class`), §9 (report trigger).

### Tasks

- [ ] **7.1 Types v2:** `StudentReport`, `AttendanceRecord` (`present | absent | no_show | late`).
- [ ] **7.2 Supabase methods:** `getBookingsForTeacher`, `createClassSlot`, `updateClassSlot` (with `class_rates` price), `deactivateClassSlot`, `cancelSession`, `getAttendance`, `getChildAttendance`, `saveAttendance`, `getTeacherAssessments`, `createTeacherAssessments`, `updateAssessment`, `getTeacherReports`, `createReport`, `getReportsForChild`.
- [ ] **7.3 Teacher pages** use `useAuth().teacherId` (no `'tch1'`): Dashboard (today's sessions), Classes (CRUD with zod validation), Students (grouped from `getBookingsForTeacher`), **Attendance (pick a dated session, pre-load, save persists)**, Assessments, Reports (`current_term_label` from settings).
- [ ] **7.4 `AdminMyTeachingPage`:** initial teacher = `useAuth().teacherId`; friendly state if the admin has no teacher row.
- [ ] **7.5 Parent `ReportsPage`:** `getReportsForChild(child.id)` — replaces the loop over all teachers.
- [ ] **7.6 Parent `ChildProfilePage` Attendance tab** and the Phase 5 **dashboard widgets** (attendance %, latest tutor note, progress bars from the latest report ratings); hide each widget when there's no data.

### Exit criteria

- [ ] **12** Jessica sees only her own classes' students; attendance survives a reload; publishing a report creates a `report_ready` notification for the family.
- [ ] As a teacher, `select * from families` (via the app/RLS test) returns nothing; a teacher cannot create a report for a child they don't teach.
- [ ] Cancelling a session as a teacher returns credits to every booked family (check `term_credit_ledger`).
- [ ] No `ALL_FAMILY_IDS`, `CURRENT_TERM`, or `'tch'` literals in teacher pages.

---

## Phase 8 — Admin operations & settings `[M–L]`

**Goal.** The owner runs the centre entirely from the UI — no SQL for day-to-day work.
**Depends on.** Phase 6. Can run in parallel with Phase 7.
**Read first.** Backend §5.3, §7 (incl. 7.2 `admin-invite-user`), Schema §13 (closures, session generation).

### Tasks

- [ ] **8.1 Supabase methods:** `getAdminStats`, `getAllBookings`, `getAllChildren`, `getWaitingList`, `upsertProgram`, `getSettings`/`updateSetting`, `uploadDocument`, `inviteStaff`, plus closures read/write.
- [ ] **8.2 `AdminHomePage`:** stat tiles from `admin_dashboard_stats`, today's schedule from sessions + bookings, attendance chart (hide when empty).
- [ ] **8.3 `AdminBookingsPage`:** `getAllBookings`; cancel with an explicit "return credit?" override.
- [ ] **8.4 `AdminTimetablePage`:** class-slot CRUD (ISO day, time, duration, capacity, program, teacher, price); delete = `deactivateClassSlot` with a confirmation showing affected bookings and a "cancel upcoming sessions too" option; per-session **Cancel** (public holiday); **Closures** editor.
- [ ] **8.5 `AdminProgramsPage`:** `getPrograms`/`upsertProgram`, student counts from `v_program_stats`.
- [ ] **8.6 Deploy `admin-invite-user`** (Backend §7 intro + §7.2): Edge Functions → *Via Editor*, **Verify JWT ON**, no extra secrets. **`AdminTutorsPage`:** *Invite tutor* → email arrives → link lands on `/reset-password` → teacher sets password → logs in as teacher.
- [ ] **8.7 `AdminSettingsPage`:** business info → `business`; **bank + contact → `public_info`**; pricing / term rules behind an "are you sure" confirmation (they are "Ask first" items); real **document upload with versioning** (`documents` bucket + `documents` row, version +1); notification toggles bound to `notification_preferences` (the push effect arrives in Phase 10). Remove every `defaultValue` literal.
- [ ] **8.8 Optional:** `/admin/waiting-lists` page using `getWaitingList`.

### Exit criteria

- [ ] Create a class → sessions appear within the window; cancel one session → every booked family gets credits back + a notification.
- [ ] Deactivate a class with bookings → blocked with a clear message unless "cancel sessions too" is chosen.
- [ ] Invite a tutor (plus-address) → set password → can log in as a teacher; their `teachers` row exists; a parent can't reach the invite function (403).
- [ ] Uploading a new T&Cs PDF bumps the version; the enrolment page links to the new file; the old version remains in Storage.
- [ ] Settings persist across reload; bank details changed here appear on the parent Payments page.
- [ ] **16** `select * from public.v_counter_drift;` → 0 rows after an admin session.

---

## Phase 9 — Messaging & real-time in-app notifications `[M]`

**Goal.** Live conversations between parents, teachers and the centre; bell + toasts update instantly.
**Depends on.** Phase 4 (auth); meaningful after Phases 5–6 (events exist).
**Read first.** Backend §5.2/5.3/5.4 (Messages rows), §9, Schema §9 (`send_message`, `get_conversations`).

### Tasks

- [ ] **9.1 Supabase methods:** `getConversations` (RPC), `startConversation`, `getMessages`, `sendMessage`, `markConversationRead`.
- [ ] **9.2 Parent `MessagesPage`:** support thread auto-created via `startConversation('parent_staff', …)`; "Message {teacher}" from the child profile; **no client-sent sender name**.
- [ ] **9.3 `AdminMessagesPage`** (shared staff inbox; compose to any family/teacher; quick-action reminders with `is_reminder`) and **`TeacherMessagesPage`** (incl. teacher↔admin thread). Remove `ADMIN_ID` and hard-coded recipients.
- [ ] **9.4 `useRealtime`** (Backend §9.3), mounted once in `AppShell`; preferably behind `dataClient.subscribe(...)` so no `supabase.channel` call lives in a hook. Handle `notifications` (filtered by `recipient_id`) and `messages`.
- [ ] **9.5 Toast component** (existing classes) for incoming notifications; notification-drawer items navigate to `action_url`.
- [ ] **9.6 Invalidation on events** — shop types are added in Phase 11.
- [ ] **9.7 Preferences UI** (parent drawer): per-category in-app/push switches bound to `notification_preferences` (push takes effect in Phase 10).

### Exit criteria

- [ ] Two browsers (parent + admin): messages appear live; unread counts correct per party; marking read persists.
- [ ] A teacher can message a family they teach and cannot message others (`forbidden`).
- [ ] A notification created in SQL (`select private.notify_family(…)`) shows up in the bell with a toast within a couple of seconds, no refresh.
- [ ] `select private.send_term_expiry_reminders();` produces a notification **and** a system message in the parent's support thread, exactly once.
- [ ] Turning a category's in-app switch off stops new in-app rows for that category.

---

## Phase 10 — FCM push notifications `[M]`

**Goal.** Every notification row also arrives as a push on registered devices, with click-through, retries and preference handling.
**Depends on.** Phase 4 (and 9 for the UI). Needs owner approval for the `firebase` dependency.
**Read first.** Backend §7.1, §8 (all), Schema §6 (`dispatch_push`, `claim_notification_push`), §13.1.

### Tasks

- [ ] **10.1 Firebase dev project** (Backend §8.2): web app config → `VITE_FIREBASE_*`; Web Push key pair → `VITE_FIREBASE_VAPID_KEY`; confirm **Cloud Messaging API (V1)** enabled; create the service-account JSON.
- [ ] **10.2 Edge secrets** (dashboard): `FIREBASE_SERVICE_ACCOUNT` (whole JSON), `PUSH_WEBHOOK_SECRET`, `APP_URL`. Delete the downloaded JSON.
- [ ] **10.3 Deploy `send-push`** (Backend §7.1), **Verify JWT OFF**; keep the repo copy in sync.
- [ ] **10.4 Vault secrets** in the SQL Editor (Schema §13.1): `push_function_url` = the hosted function URL, `push_function_secret` = the same value as `PUSH_WEBHOOK_SECRET`.
- [ ] **10.5 Install `firebase`** (approved), pin the same version in `public/firebase-messaging-sw.js`.
- [ ] **10.6 Web files:** `public/firebase-messaging-sw.js`, `src/lib/push/webPush.ts` (`pushState`, `enablePush`, `syncToken`, `disablePushForThisDevice`, optional `onForegroundPush`) — Backend §8.3.
- [ ] **10.7 UI integration** (Backend §8.4): opt-in card in the notification drawer (user-gesture only; remember dismissal 30 days; handle `unsupported`/`denied`); `syncToken()` after login; `disablePushForThisDevice()` before sign-out; `NAVIGATE` message handler → `router.navigate`; push switches in preferences become active; iOS "add to Home Screen" hint.
- [ ] **10.8 `dataClient.registerDevice / unregisterDevice`** (already RPC-backed) wired.

### Exit criteria (Backend §8.6)

- [ ] Click *Turn on notifications* → a `user_devices` row exists.
- [ ] An event as another user (e.g. admin approves a payment) → `notifications.push_status = 'sent'` and a browser notification appears when the tab is in the background; foreground shows the toast.
- [ ] Clicking the notification focuses/opens the correct route.
- [ ] Revoke permission → no push, in-app still works. Sign out → `user_devices` row removed. Category push switch off → `push_status = 'skipped'`.
- [ ] Temporarily break `PUSH_WEBHOOK_SECRET` → rows stay `pending` and are delivered by the 1-minute sweeper after you restore it; a bogus token gets `disabled_at` set.
- [ ] No Firebase service-account data anywhere in the repo or the built `dist/`.

**Gotchas.** The service worker must be served from the site root over HTTPS (localhost is exempt). With `APP_URL=http://localhost…` the push link is omitted by design (FCM needs https) — click-through then relies on the service worker. iPhone web push works only for a site added to the Home Screen.

---

## Phase 11 — Learning Shop `[L]`

**Goal.** The shop from your update note, secure and real: portal checkout (COD / advance), my orders, admin verification and status management, product catalogue management, and **public guest checkout**.
**Depends on.** Phase 2 (DB) and Phase 4 (auth). Phase 10 optional (admin push on new orders). Owner decisions from §0.5 (Phase 11 row).
**Read first.** Backend §14 (all), §7 intro; Schema §13A.

Split into three sub-phases; each can be merged separately.

### 11A — Portal shop

- [ ] **11A.1** Supabase methods: `getShopProducts`, `getShopOrders`, `placeOrder` (portal branch), `getShopReceiptUrl` (Backend §14.3, §14.5).
- [ ] **11A.2 `LearningShopPage`:** products via `get_shop_products` with stock badges; cart stays local; quantity clamp from `settings.shop.max_qty_per_line`; checkout keeps the **`File`**; `orderId` in `useRef(newId())`; delivery prefilled from the family; bank card from `public_info`; reference `${reference_code}-SHOP`; errors incl. `out_of_stock` → refresh products.
- [ ] **11A.3 `MyOrdersPage`:** order numbers (`FBO-…`), new `Cancelled` / `refunded` badges, rejection note.

### 11B — Admin shop

- [ ] **11B.1** Methods: `getAllShopOrders` (paginated), `getShopStats`, `verifyShopOrder`, `updateShopOrderStatus`, `getAdminShopProducts`, `upsertShopProduct`, `uploadShopProductImage`.
- [ ] **11B.2 `AdminOrdersPage`:** stats from `admin_shop_stats`; Pending-verification / All tabs with "Load more"; Review modal with **signed receipt preview**, Approve / Reject (note required); **status control** limited to valid next states; Cancel confirmation mentions manual refunds; `mailto:` for guest rows.
- [ ] **11B.3 `printReceipt` rewritten with full HTML escaping** (Backend §14.7); contact email from `public_info`.
- [ ] **11B.4 `AdminShopProductsPage`** (new route `/admin/shop-products`): table, create/edit modal (zod), image upload, stock, active toggle. Add nav items.
- [ ] **11B.5 Settings:** shop rules (`shop`) editor behind a confirm; **Shop orders** notification toggle (`orders`); Realtime invalidation for `shop_*` types (Backend §14.8).

### 11C — Guest checkout

- [ ] **11C.1 Deploy `shop-guest-checkout`** (Backend §14.4): Edge Functions → *Via Editor*, **Verify JWT OFF**; secrets `IP_HASH_SALT` (+ optional `TURNSTILE_SECRET`, `RESEND_API_KEY`, `MAIL_FROM`).
- [ ] **11C.2 `placeOrder` guest branch** (`upload_url` → `uploadToSignedUrl` → `place`).
- [ ] **11C.3 Public `ShopPage`** at `/shop` **outside every `RequireRole`**; email validation; optional Turnstile widget (`VITE_TURNSTILE_SITE_KEY`); friendly `rate_limited` / `guest_checkout_disabled` / `out_of_stock`; signed-in users get a "Go to your portal shop" link. Landing page uses `<Link to="/shop">`.

### Exit criteria (Backend §11.2 rows 17–27, plus §14.10)

- [ ] **17–18** Guest COD and advance orders succeed; receipt stored under `shop-receipts/guest/{id}/…`; admins notified; stock decremented.
- [ ] **19** Signed out, DevTools: `select` on `shop_orders`, `rpc('place_guest_order')`, `rpc('verify_shop_order')`, reading the receipts bucket → all denied.
- [ ] **20** The 6th guest order from one browser within an hour → `rate_limited`.
- [ ] **21–23** Portal tamper attempts have no effect; out-of-stock and last-unit races behave (stock never negative).
- [ ] **24–26** Admin approve → `paid/Processing` and parent notified; invalid transition rejected; valid path works and COD becomes paid on *Delivered*; cancelling a paid order restores stock and flags `refunded`.
- [ ] **27** Hostile text such as `<img src=x onerror=alert(1)>` in an address renders as plain text on the receipt.
- [ ] Rejected advance orders auto-cancel after `advance_hold_days` (test with `select private.cancel_stale_advance_orders();` after back-dating a row).

---

## Phase 12 — Mock removal & hardening `[M]`

**Goal.** Nothing mock-related remains; the whole system is verified end to end; security is re-checked as an attacker would.
**Depends on.** All feature phases you intend to ship.
**Read first.** Backend §10 (all), §11.2.

### Tasks

- [ ] **12.1 Remove the composite client:** `client.ts` becomes `export const dataClient = createSupabaseDataClient(supabase);` (delete the `// TEMP-LEGACY` line). Confirm every method of the final `DataClient` (Backend §3.1) is implemented.
- [ ] **12.2 Delete** `src/lib/data/mock/*` and the old Supabase stub; delete `VITE_DATA_SOURCE` from env files and typings; work through the **edit table in Backend §10.2** (names, price constants, hard-coded maps, demo hints).
- [ ] **12.3 Add `scripts/check-no-mock.sh`** with the greps from Backend §10.3 and an npm script `check:no-mock`; add it to CI if you have one.
- [ ] **12.4 Dead-code sweep:** `.otp-demo-hint` CSS, unused props, unused imports; unused env typings.
- [ ] **12.5 Update the project docs** that describe the mock (`projectDets/architecture.md`, `phases.md`, `rules.md` §8 step 3 → use the acceptance matrix). **Do not edit** `Fairybread_Fractions_Rebuild_Spec.md`.
- [ ] **12.6 Full acceptance run:** Backend §11.2 rows **1–32**, executed on a freshly reset dev project (`dev_reset.sql` + `seed.sql`).
- [ ] **12.7 Security review:**
  - Re-run the Phase 1/2 structural checks (RLS on, anon grants, function execute lists).
  - As each role, try forbidden reads/writes directly with the anon key + user JWT (other family's data, `payments` update, role change, insert into `terms`, read other family's proof/receipt).
  - `npm run build` then `grep -r "service_role\|FIREBASE_SERVICE_ACCOUNT\|PUSH_WEBHOOK_SECRET\|IP_HASH_SALT" dist` → nothing.
  - Security Advisor and Performance Advisor clean; any "unindexed foreign key" findings reviewed.
- [ ] **12.8 Data-integrity check:** `v_counter_drift` = 0 after the full run; the three invariant queries = 0.
- [ ] **12.9 Failure-mode pass:** offline/slow network, expired session mid-action, double-clicks, back button during checkout, refresh in the middle of OTP signup.

### Exit criteria

- [ ] `grep -rn "TEMP-LEGACY\|lib/data/mock\|VITE_DATA_SOURCE" src` → nothing; `npm run check:no-mock` passes.
- [ ] Acceptance matrix rows 1–32 all pass on a clean seed.
- [ ] typecheck / lint / build green; `dist/` clean of secrets.
- [ ] A short written security-review note (what was tested, what was found, what was fixed).

---

## Phase 13 — Production launch (+ React Native hand-off) `[M]`

**Goal.** Real families use the system safely; the project is ready for the future mobile app.
**Depends on.** Phase 12. Owner decisions from §0.5 (Phase 13 row).
**Read first.** Backend §2.4, §13, §14.10, §12; Schema §16.

### Tasks — production environment

- [ ] **13.1 Create `fairybread-prod`** (Sydney), paid plan, **PITR on**, 2FA for every org member. Extensions as in Phase 0.3.
- [ ] **13.2 Apply migrations 0001 → 0011 → 0012a → 0012b → 0013** in order (wrapped, logged in the prod section of `MIGRATIONS_LOG.md`). **Never run `seed.sql` or `dev_reset.sql` here.** Run the structural checks from Phases 1–2 and the Security Advisor.
- [ ] **13.3 Auth settings** (Backend §2.4): production Site URL only, no `localhost` redirects, Confirm email on, OTP 6 / 600 s, leaked-password protection if available, CAPTCHA on sign-up, custom SMTP on your own domain with SPF/DKIM, branded templates.
- [ ] **13.4 Firebase production project** + prod service account; VAPID key; `VITE_FIREBASE_*` for the production build.
- [ ] **13.5 Edge Functions on prod:** `send-push`, `admin-invite-user`, `shop-guest-checkout` (and `delete-account` if mobile is imminent) with **prod-specific secrets** (new `PUSH_WEBHOOK_SECRET`, `IP_HASH_SALT`, `APP_URL` = production origin, Turnstile + Resend keys). Create the two Vault secrets with the prod function URL.
- [ ] **13.6 Content & first users:** promote the first admin (`update public.profiles set role = 'admin' where email = '…'`); enter the **real** bank details/contact in Settings (`public_info`); upload the real T&Cs / privacy / trampoline PDFs; review prices and term rules with the owner; invite real tutors; create real programs and classes.
- [ ] **13.7 Hosting:** build with prod env vars; SPA fallback (`/* → /index.html`); `/firebase-messaging-sw.js` served as JavaScript from the root; HTTPS only; CSP allowing `*.supabase.co`, `www.gstatic.com`, `*.googleapis.com` (+ `challenges.cloudflare.com` if Turnstile).
- [ ] **13.8 Legal/ops:** privacy policy mentions payment-record retention, push notifications and guest-order data; decide retention and a deletion routine for guest orders; schedule a weekly check of `v_counter_drift`; note who monitors the Edge Function logs and the payment/order queues.

### Tasks — smoke test on production (use your own plus-addressed accounts, then clean up)

- [ ] Sign up a test parent (OTP), enrol a child, submit a small term payment, approve it as admin, book a class, cancel it, send a message, receive a push, place a shop order and a guest order; then remove the test data through the admin UI / SQL.

### Tasks — React Native hand-off (Backend §12)

- [ ] **13.9** Keep `lib/data/**`, `lib/utils/**`, `types/**` free of DOM/Vite imports (already enforced by Phase 3/12 rules). Register the `fairybread://auth/callback` redirect URL in Auth.
- [ ] **13.10** Plan the monorepo split (`packages/core`, `apps/web`, `apps/mobile`); deploy `delete-account` (App Store requirement); add the iOS/Android apps to the Firebase project (APNs key, SHA-1). **No schema change is required for mobile.**

### Exit criteria

- [ ] Backend §13.1 and §14.10 checklists fully ticked on **production**.
- [ ] Smoke test passed and its test data removed; `v_counter_drift` = 0 on prod.
- [ ] Backup restore drill done once (PITR or a dump).
- [ ] Owner has the written list of open decisions that remain (retention, shipping, etc.).

---

## Appendix A — Where each document section is used

| Phase | Schema | Backend |
|---|---|---|
| 0 | §0 | §2.1–2.3 |
| 1 | §1, §3–§13, §15 | §2.1 |
| 2 | §13A, §13B, §14, §14.1, §15 | §2.1, §11.2 |
| 3 | — | §1, §2.3, §3.3–3.6, §14.2 |
| 4 | §7 | §3.7, §4 |
| 5 | §8 | §3.1–3.2, §3.7, §5.2 |
| 6 | §8 | §5.2–5.3, §6 |
| 7 | §8, §9 | §5.2, §5.4 |
| 8 | §13 | §5.3, §7.2 |
| 9 | §9 | §9 |
| 10 | §6, §13.1 | §7.1, §8 |
| 11 | §13A | §14, §7 |
| 12 | §15 | §10, §11 |
| 13 | §16 | §2.4, §12, §13, §14.10 |

## Appendix B — Reusable prompt for your coding agent

> You are implementing **Phase N** of `IMPLEMENTATION_PHASES.md` for the Fairybread & Fractions project.
> Read the "Working agreements" (§0.3), the Phase N section, and the document sections it lists under *Read first*.
> Backend is **hosted Supabase (Dashboard + SQL Editor only) — no Docker, no CLI, no local stack**.
> Do **only** this phase's tasks; do not start later phases or change unrelated files.
> For any SQL, tell me exactly which file to paste into the SQL Editor and which checkpoint query to run; never edit an already-applied migration.
> When finished, list each exit criterion with evidence, and anything that deviated from the docs.
> If a criterion fails, stop and report instead of loosening security (RLS, grants) to make it pass.

## Appendix C — Quick status tracker

| Phase | Status | Branch | Merged on | Notes |
|---|---|---|---|---|
| 0 Foundation | ☐ | | | |
| 1 DB core | ☐ | | | |
| 2 Shop/OTP DB + seed + acceptance | ☐ | | | |
| 3 Client foundation | ☐ | | | |
| 4 Authentication | ☐ | | | |
| 5 Parent credit loop | ☐ | | | |
| 6 Money loop | ☐ | | | |
| 7 Teaching loop | ☐ | | | |
| 8 Admin operations | ☐ | | | |
| 9 Messaging & realtime | ☐ | | | |
| 10 FCM push | ☐ | | | |
| 11 Learning Shop (A/B/C) | ☐ | | | |
| 12 Mock removal & hardening | ☐ | | | |
| 13 Production launch | ☐ | | | |
