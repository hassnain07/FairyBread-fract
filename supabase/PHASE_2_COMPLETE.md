# Phase 2 — Shop & OTP Migrations + Seed Data: Completion Record

**Status:** ✅ Complete  
**Date completed:** 2025  
**Branch:** `main`  
**Depends on:** Phase 1 complete (migrations 0001–0011 applied)

---

## What Phase 2 covered

Applied the shop and OTP hygiene migrations, uploaded Storage documents, ran the full demo-world seed, and verified all structural and data checkpoints. The app still runs on the mock data client; no app code was changed in this phase.

---

## Task-by-task record

### 2.1 Apply `0012a_shop_enums.sql` — ✅

`ALTER TYPE ... ADD VALUE` statements cannot run inside a transaction block. The file was pasted into the SQL Editor **without** a `BEGIN`/`COMMIT` wrapper.

Enums added to `payment_method`:
- `shop_card`
- `shop_cash`
- `shop_bank`

Enum `shop_order_status` created:
- `pending_review`, `approved`, `rejected`, `fulfilled`

### 2.2 Apply `0012b_shop.sql` — ✅ (after cleanup)

**First attempt failed** — a previous partial run had left behind some objects (policies, functions). The following cleanup was run before re-applying:

```sql
-- Part 1: drop functions
drop function if exists public.get_shop_products();
drop function if exists public.place_shop_order(uuid,jsonb,text,text,text,text);
drop function if exists public.get_shop_orders(text);
drop function if exists public.review_shop_order(uuid,shop_order_status,text);
drop function if exists public.get_my_shop_orders();

-- Part 2: drop tables (cascade removes policies automatically)
drop table if exists public.shop_order_items cascade;
drop table if exists public.shop_orders cascade;
drop table if exists public.shop_products cascade;
```

After cleanup, `0012b_shop.sql` was re-run successfully inside `BEGIN`/`COMMIT`.

Objects created:
- Tables: `shop_products`, `shop_orders`, `shop_order_items`
- RLS policies on all three tables
- RPC functions: `get_shop_products`, `place_shop_order`, `get_shop_orders`, `review_shop_order`, `get_my_shop_orders`
- `pg_cron` job: `shop-order-expire` (expires stale pending orders nightly)

### 2.3 Apply `0013_auth_otp_hygiene.sql` — ✅

Run inside `BEGIN`/`COMMIT`. Added the 10th `pg_cron` job: `otp-hygiene` — purges unverified auth users older than 24 hours nightly at 03:15 UTC.

Structural check after this step:
```sql
select count(*) from cron.job;
-- result: 10 ✅
```

### 2.4 Storage — document PDFs — ✅

Three placeholder PDFs uploaded to the `documents` bucket:

| Storage path | Document |
|---|---|
| `terms/v1.pdf` | Terms & Conditions v1 |
| `privacy/v1.pdf` | Privacy Policy v1 |
| `mini_trampoline/v1.pdf` | Mini Trampoline Waiver v1 |

INSERT into `public.documents` run after upload to register the records.

### 2.5 Run `seed.sql` — ✅

Run in the SQL Editor with no wrapper (file uses explicit `BEGIN`/`COMMIT` blocks internally where needed).

Demo world created:

| Entity | Count |
|---|---|
| Auth users | 7 (1 admin, 2 teachers, 4 parents) |
| Profiles | 7 |
| Families | 4 |
| Children | 5 |
| Programs | 3 |
| Classes | 4 |
| Terms | 4 |
| Bookings | 6 |
| Attendance records | 12 |
| Payments | 5 |
| Reports | 3 |
| Conversations | 2 |
| Notifications | 6 |
| Shop products | 6 |
| Shop orders | 3 |

Mock family test cases preserved from the mock data client:

| Family | Scenario |
|---|---|
| f1 | ACTIVE_TERM / 3 credits remaining |
| f2 | ACTIVE_TERM / 0 credits remaining |
| f3 | TERM_EXPIRED |
| f4 | NO_TERM_EVER |

### 2.6 Checkpoint queries — ✅

```sql
select count(*) from public.profiles;         -- 7 ✅
select count(*) from public.shop_products;    -- 6 ✅
select count(*) from public.shop_orders;      -- 3 ✅
select count(*) from cron.job;                -- 10 ✅
select * from public.v_counter_drift;         -- 0 rows ✅
```

### 2.7 OTP purge test — ✅

Created a throwaway unverified user via the Auth API, back-dated `created_at` to > 24 hours ago, triggered the `otp-hygiene` cron manually, confirmed the user was deleted.

### 2.8 Reset rehearsal — ✅

Ran `dev_reset.sql` (all business tables truncated, all auth users deleted, sequences reset), then re-ran `seed.sql`. All checkpoint counts matched expected values after re-seed.

### 2.9 Update `MIGRATIONS_LOG.md` — ✅

All 16 entries (Phase 1: 0001–0011, Phase 2: 0012a, 0012b, 0013, seed, dev_reset) recorded in `supabase/MIGRATIONS_LOG.md`.

---

## Exit criteria check

| Criterion | Result |
|---|---|
| `0012a` applied without transaction wrapper; all shop enums exist | ✅ |
| `0012b` applied cleanly after partial-run cleanup; shop tables + RLS + RPC exist | ✅ |
| `0013` applied; cron job count = 10 | ✅ |
| 3 placeholder PDFs in Storage `documents` bucket; `public.documents` has 3 rows | ✅ |
| `seed.sql` runs to completion; profiles=7, shop_products=6, shop_orders=3 | ✅ |
| `v_counter_drift` returns 0 rows | ✅ |
| OTP purge cron deletes unverified users older than 24 h | ✅ |
| `dev_reset.sql` + `seed.sql` re-run produces identical checkpoint counts | ✅ |
| `MIGRATIONS_LOG.md` updated with all 16 entries | ✅ |
| `npm run build` still exits 0; app still runs on mock | ✅ |

---

## Known deviations / open items

| # | Item | Impact | Action |
|---|---|---|---|
| 1 | Custom SMTP not configured (carried over from Phase 0) | OTP emails won't reach external inboxes | Configure before Phase 4 acceptance tests |
| 2 | `0012b_shop.sql.bak` left in `supabase/migrations/` | Cosmetic only — not a migration file | Delete or move to a `_archive/` folder before going to production |
| 3 | `seed.sql` and `dev_reset.sql` were absent from the repo at Phase 0 close despite being listed as complete | No functional impact — files were created before Phase 2 ran | Already resolved ✅ |

---

## Files changed in this phase

| File | Change |
|---|---|
| `supabase/migrations/0012a_shop_enums.sql` | Applied to DB (file existed from Phase 0) |
| `supabase/migrations/0012b_shop.sql` | Applied to DB after partial-run cleanup |
| `supabase/migrations/0013_auth_otp_hygiene.sql` | Applied to DB (file existed from Phase 0) |
| `supabase/seed.sql` | Created (was missing) + applied to DB |
| `supabase/dev_reset.sql` | Created (was missing) + rehearsal run confirmed |
| `supabase/MIGRATIONS_LOG.md` | Updated with all 16 migration entries |
| `supabase/PHASE_2_COMPLETE.md` | Created (this file) |

No app source files (`src/`) were modified in this phase.

---

## Next step

**Phase 3 — Supabase data client (auth + core reads)**

The app will be wired to Supabase for the first time. A composite client strategy is used:

```
VITE_DATA_SOURCE=supabase
→ { ...legacyMock, ...supabaseImpl }   // TEMP-LEGACY comment on every mock passthrough
```

Phase 3 implements: `signUp`, `verifyOtp`, `signIn`, `signOut`, `resetPassword`, `getProfile`, and the first read-only queries (programs, classes, children). The mock remains the fallback for everything not yet implemented.

Prerequisites before starting Phase 3:
1. Supabase project URL and anon key are in `.env.local` ✅
2. All Phase 2 checkpoint queries pass ✅
3. `npm run build` exits 0 ✅

When ready, say **"ready for Phase 3"**.
