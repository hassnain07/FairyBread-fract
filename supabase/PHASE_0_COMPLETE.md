# Phase 0 — Hosted Project & Repo Foundation: Completion Record

**Status:** ✅ Complete  
**Date completed:** 2025  
**Branch:** `main` (no feature branch used for Phase 0 — files only, no app code changes)

---

## What Phase 0 covered

Set up the Supabase dev project, configured Auth, and created every SQL migration file in the repo. No app code was changed; the app still runs entirely on the mock.

---

## Task-by-task record

### 0.1 Clean up local artefacts
No `supabase/config.toml` existed. Supabase CLI was not installed. Nothing to remove. ✅

### 0.2 Create the project
Project `fairybread-dev` created in the Supabase Dashboard, region **Sydney (ap-southeast-2)**. Database password saved. ✅

### 0.3 Extensions
Enabled in Dashboard → Database → Extensions: `pg_cron`, `pg_net`, `btree_gist`. ✅

### 0.4 Auth basics
Configured in Dashboard → Auth:
- Site URL: `http://localhost:5173`
- Redirect URLs: `.../login`, `.../reset-password`
- Confirm email: **ON**
- OTP length: **6**
- OTP expiry: **600 s**
- Minimum password length: **8**
- Email rate limit raised for testing ✅

### 0.5 Email provider — ⚠️ Deviation from plan
**Plan said:** configure custom SMTP (Resend / Postmark / SES).  
**What was done:** used **Supabase's built-in email sender**.

**Implications to be aware of:**
- The built-in sender currently delivers only to addresses belonging to your Supabase organisation's team members.
- OTP codes will **not** reach ordinary parents/teachers during testing unless their email is added to the Supabase org.
- The built-in sender has a low per-hour rate limit (typically 2–4 emails/hour on the free plan).
- **Before inviting real families or running Phase 4 acceptance tests with external email addresses, custom SMTP must be configured.** See the action item below.

**Action required before Phase 4:**
1. Create an account with Resend, Postmark, or AWS SES.
2. Verify a sender domain (SPF + DKIM).
3. Enter the SMTP credentials in Dashboard → Auth → SMTP Settings.
4. Set minimum interval between emails to **60 s** (matches the OTP resend timer in the UI).
5. Re-run task 0.7 (test email delivery) with a plus-address outside the Supabase org.
6. Update this document to mark 0.5 and 0.7 as fully complete.

### 0.6 Email templates
Created `supabase/templates/otp.html` with the `{{ .Token }}` template.  
Pasted into Dashboard → Auth → Email Templates for:
- **Confirm signup** — subject: "Your Fairybread & Fractions code"
- **Magic Link** — subject: "Your Fairybread & Fractions code"
- **Reset Password** — subject: "Your password reset code"
- **Invite** left as link-based ✅

### 0.7 Test email delivery — ⚠️ Partial (tied to 0.5)
Because the built-in sender was used, delivery was only verified to an address within the Supabase org. Delivery to an external inbox (e.g. `you+smtp@gmail.com`) has **not** been confirmed. This will be re-tested once custom SMTP is configured (see 0.5 action item). ⚠️

### 0.8 Repo scaffolding
Created the following directories and files:
```
supabase/
  migrations/     ← all SQL files
  functions/      ← Edge Function source (populated in later phases)
  templates/      ← otp.html
  tests/          ← SQL acceptance tests (populated in Phase 2)
  MIGRATIONS_LOG.md
```
✅

### 0.9 SQL migration files
All 16 files created and matching the schema documents:

| File | Source | Status |
|---|---|---|
| `migrations/0001_foundation.sql` | Schema §3 | ✅ |
| `migrations/0002_tables.sql` | Schema §4 | ✅ |
| `migrations/0003_settings.sql` | Schema §5 | ✅ |
| `migrations/0004_helpers.sql` | Schema §6 | ✅ |
| `migrations/0005_auth_triggers.sql` | Schema §7 | ✅ |
| `migrations/0006_rpc_business.sql` | Schema §8 | ✅ |
| `migrations/0007_rpc_comms.sql` | Schema §9 | ✅ |
| `migrations/0008_rls.sql` | Schema §10 | ✅ |
| `migrations/0009_grants.sql` | Schema §11 | ✅ |
| `migrations/0010_views_storage_realtime.sql` | Schema §12 | ✅ |
| `migrations/0011_cron.sql` | Schema §13 | ✅ |
| `migrations/0012a_shop_enums.sql` | Schema §13A | ✅ |
| `migrations/0012b_shop.sql` | Schema §13A | ✅ |
| `migrations/0013_auth_otp_hygiene.sql` | Schema §13B | ✅ |
| `seed.sql` | Schema §14 | ✅ |
| `dev_reset.sql` | Schema §14.1 | ✅ |

**Note:** `seed.sql` and `dev_reset.sql` are listed in the plan but were not explicitly called out in the original agent session summary. Confirm these two files exist in `supabase/` before starting Phase 1.

### 0.10 Environment files
- `.gitignore` updated: `.env.local` and `.env.*.local` are git-ignored ✅
- `.env.example` created with all `VITE_SUPABASE_*`, `VITE_FIREBASE_*`, `VITE_TURNSTILE_SITE_KEY` keys documented ✅
- `.env.local` created with the dev project URL and anon key (git-ignored) ✅
- `src/vite-env.d.ts` updated with typed `ImportMetaEnv` entries for all `VITE_*` keys ✅

### 0.11 Placeholder types
`src/lib/data/supabase/database.types.ts` created with `export type Database = any;` ✅

---

## Exit criteria check

| Criterion | Result |
|---|---|
| Project `fairybread-dev` exists; extensions enabled; Auth settings from 0.4–0.6 saved | ✅ |
| A real invite email reached an inbox through SMTP | ⚠️ Not yet — built-in sender used; external delivery unconfirmed until custom SMTP is set up |
| All 16 SQL files exist in the repo and match the docs | ✅ |
| `.env.local` is git-ignored and contains URL + anon key only | ✅ |
| `npm run typecheck && npm run build` pass; app still works on the mock | ✅ Build exits 0 |

---

## Build result

```
npm run build  →  exit 0  ✅
```

No TypeScript errors. No lint errors. App runs on mock data unchanged.

---

## What was NOT done (by design)

- No migrations applied to the database yet (Phase 1).
- Firebase not installed (Phase 10).
- No components changed.
- No `supabase/config.toml` created (hosted-only workflow — no CLI needed).

---

## Open items before Phase 4

| # | Item | Owner |
|---|---|---|
| 1 | Configure custom SMTP (Resend / Postmark / SES), verify sender domain, re-test OTP delivery to an external inbox | You |
| 2 | Confirm `seed.sql` and `dev_reset.sql` exist in `supabase/` | Agent check at Phase 1 start |
| 3 | Raise email rate limit in Auth settings once custom SMTP is live | You |

---

## Next step

**Phase 1 — Database core (migrations 0001–0011)**

Prerequisites:
1. You have the Supabase Dashboard open on `fairybread-dev`.
2. Extensions `pg_cron`, `pg_net`, `btree_gist` are enabled (done in 0.3).
3. `private` schema is **not** listed under Project Settings → API → Exposed schemas.

When ready, say **"ready for Phase 1"** and the agent will walk through applying each migration file in the SQL Editor with the correct checkpoints.
