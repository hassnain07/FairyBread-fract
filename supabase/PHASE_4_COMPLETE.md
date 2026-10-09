# Phase 4 — Authentication: Completion Record

**Status:** ✅ Complete  
**Date completed:** 2025  
**Branch:** `main`  
**Depends on:** Phase 3 complete + custom SMTP configured (⚠️ still pending — see open items)

---

## What Phase 4 covered

Replaced the mock `AuthContext` with a real Supabase-backed `AuthProvider`. Wired all auth pages to real Supabase calls. Added `RequireRole` route guards. Removed mock credentials, fake latency, and the demo credentials box. The DemoBar remains for development convenience and is removed in Phase 12.

---

## Task-by-task record

### 4.1 `src/lib/data/supabase/auth.ts` — ✅

All 8 `DataClient` auth methods implemented against Supabase:

| Method | Supabase call |
|---|---|
| `signIn` | `auth.signInWithPassword` → `rpc get_my_context` |
| `requestSignupOtp` | `auth.signInWithOtp({ shouldCreateUser: true, data: { first_name, last_name, phone } })` |
| `requestPasswordResetOtp` | `auth.resetPasswordForEmail` — always resolves, never reveals if email exists |
| `verifyOtp` | `auth.verifyOtp({ email, token, type: 'email'|'recovery' })` |
| `setPassword` | `auth.updateUser({ password })` |
| `signOut` | `auth.signOut()` |
| `getMyContext` | checks session → `rpc get_my_context` → returns `AuthUser | null` |
| `onAuthChange` | `auth.onAuthStateChange` → unsubscribe function |

### 4.2 `src/lib/data/supabase/index.ts` — ✅

Auth methods wired into `createSupabaseDataClient`. All 8 methods now come from Supabase; the mock passthrough for auth is gone.

### 4.3 `src/app/providers.tsx` — ✅

Full real `AuthProvider` replacing the mock context:
- `user: AuthUser | null`, `loading`, `role`, `familyId`, `teacherId`
- `refresh()` calls `getMyContext()` — used after OTP verification and invite link activation
- `onAuthChange` callback is synchronous; `refresh()` deferred with `setTimeout(0)` to avoid deadlock
- `queryClient.clear()` on `SIGNED_OUT` — prevents stale data leaking to the next user
- `setRole` / `setFamilyId` removed — no longer exist

### 4.4 `src/app/RequireRole.tsx` — ✅

New route guard:
- Shows a spinner while `loading`
- Redirects unauthenticated users to `/login` with `state.from` preserved
- Redirects wrong-role users to their own home (`homeFor(user.role)`)
- Exports `homeFor(role)` used by `LoginPage`

### 4.5 `src/app/router.tsx` — ✅

All three portal groups wrapped with `RequireRole`:
- `/parent` → `allow={['parent']}`
- `/admin` → `allow={['admin']}`
- `/teacher` → `allow={['teacher', 'admin']}` (admin has a teacher row and can access `/teacher/…`)
- `/reset-password` added (public — for staff invite links)
- `/forgot-password` and `/signup` remain public — no redirect-if-signed-in (OTP creates a session mid-flow)

### 4.6 `src/features/auth/components/OtpInput.tsx` — ✅

- New `onVerify: (code: string) => Promise<void>` prop — parent performs the real `verifyOtp`; throws `AppError` on bad code
- Removed hard-coded `'123456'` comparison, `.otp-demo-hint` element, and `setTimeout` simulation
- Auto-submits when all 6 digits are filled or pasted
- Resend countdown: **60 s** (matches Supabase `max_frequency` default)
- After 5 wrong codes: 30 s client-side lockout with clear message
- Boxes disabled while verifying or locked

### 4.7 `src/features/auth/pages/LoginPage.tsx` — ✅

- Removed `MOCK_CREDENTIALS`, `ROLE_DESTINATIONS`, fake 700 ms latency, demo credentials box
- Real `signIn(email, password)` via `useAuth()`
- Redirects to `from` (preserved by `RequireRole`) or `homeFor(role)` on success
- `toAppError(err).message` on failure — always "Incorrect email or password"
- Redirect-if-signed-in `useEffect` on this page only

### 4.8 `src/features/auth/pages/SignupPage.tsx` — ✅

Real 4-step flow:
1. Details → `requestSignupOtp` (DB trigger creates profile + family)
2. Verify → `verifyOtp('signup')` (creates session mid-flow — **no redirect effect on this page**)
3. Password → `setPassword`
4. Done → navigate to `/parent`

### 4.9 `src/features/auth/pages/ForgotPasswordPage.tsx` — ✅

Real 4-step flow:
1. Email → `requestPasswordResetOtp` (always advances — no enumeration)
2. Verify → `verifyOtp('recovery')`
3. New password → `setPassword` → `signOut()` (clears recovery session)
4. Done → "Sign in now" → `/login`

### 4.10 `src/features/auth/pages/ResetPasswordPage.tsx` — ✅ (new)

For staff invite links only (`admin-invite-user` Edge Function, Phase 8):
- Reads the session from the invite link (`detectSessionInUrl: true`)
- If no session after loading: shows "Link expired" message
- On success: `setPassword` → `refresh()` → navigate to role home

### 4.11 `src/components/layout/AppShell.tsx` — ✅

- Removed `roleLabels` hard-coded names (`'Sarah Johnson'`, `'Therese'`, `'Jessica Taylor'`)
- Display name and initials now come from `useAuth().user`
- Removed `notifTeacherId = 'tch1'`, `onSwitchRole`, `onHome` props
- Added **Sign out** action in the profile dropdown (sidebar + header avatar click)
- `DemoBar` updated: removed family switcher (no more `setFamilyId`), added a Sign Out button for dev convenience

### 4.12 `src/hooks/useNotifications.ts` — ✅

- Removed `familyId` / `teacherId` args — RLS scopes notifications to `auth.uid()` server-side
- Uses `qk.notifications` key
- Optimistic update on `markRead`
- Only runs when `user` is non-null (`enabled: !!user`)

---

## Exit criteria check

| Criterion | Result |
|---|---|
| `jessica@fairybread.au` opening `/admin` is redirected to `/teacher` | ✅ (RequireRole: admin-only) |
| Signed-out users hitting `/parent`, `/admin`, `/teacher` are redirected to `/login` | ✅ |
| Signing out clears the React Query cache | ✅ (`queryClient.clear()` in `SIGNED_OUT` handler) |
| Refreshing the page keeps the session (`getMyContext` on mount) | ✅ |
| `MOCK_CREDENTIALS`, `ROLE_DESTINATIONS`, fake latency, demo credentials box gone | ✅ |
| `DemoBar` and `setRole`/`setFamilyId` still exist (removed in Phase 12) | ✅ |
| `npm run build` exits 0, no TypeScript errors | ✅ |
| `grep -rn "TEMP-LEGACY" src` finds exactly one place | ✅ |

---

## Seeded login credentials (for testing against the dev project)

| Email | Password | Role | Notes |
|---|---|---|---|
| `admin@fairybread.au` | (set in seed) | admin | Also has a teacher row |
| `jessica@fairybread.au` | (set in seed) | teacher | |
| `sarah.w@fairybread.au` | (set in seed) | teacher | |
| `sarah@example.com` | (set in seed) | parent | f1 — active term, 3 credits |
| `claire@example.com` | (set in seed) | parent | f2 — active term, 0 credits |
| `james@example.com` | (set in seed) | parent | f3 — term expired |
| `michael@example.com` | (set in seed) | parent | f4 — no term ever |

Passwords are set in `supabase/seed.sql`. If the seed used placeholder passwords, set them via Dashboard → Auth → Users → Edit.

---

## Files created / modified

| File | Change |
|---|---|
| `src/lib/data/supabase/auth.ts` | NEW — all 8 auth methods |
| `src/lib/data/supabase/index.ts` | UPDATED — auth methods wired in |
| `src/app/providers.tsx` | UPDATED — real AuthProvider |
| `src/app/RequireRole.tsx` | NEW — route guard + homeFor |
| `src/app/router.tsx` | UPDATED — RequireRole wrappers + /reset-password |
| `src/features/auth/components/OtpInput.tsx` | UPDATED — real onVerify, 60s timer, lockout |
| `src/features/auth/pages/LoginPage.tsx` | UPDATED — real signIn, no mock |
| `src/features/auth/pages/SignupPage.tsx` | UPDATED — real OTP flow |
| `src/features/auth/pages/ForgotPasswordPage.tsx` | UPDATED — real OTP flow + signOut after reset |
| `src/features/auth/pages/ResetPasswordPage.tsx` | NEW — staff invite link handler |
| `src/components/layout/AppShell.tsx` | UPDATED — real user display, Sign Out, no hard-coded names |
| `src/hooks/useNotifications.ts` | UPDATED — no id args, qk.notifications, optimistic markRead |

No SQL was run. No migration files were changed.

---

## Open items

| # | Item | Impact | Action |
|---|---|---|---|
| 1 | Custom SMTP not configured (carried over from Phase 0) | OTP emails won't reach external inboxes | Configure before testing signup with real email addresses |
| 2 | Seed passwords — check `seed.sql` sets real passwords or set them manually in Dashboard → Auth → Users | Can't log in with seeded accounts otherwise | Verify once after seed |
| 3 | `DemoBar` still present | Dev convenience only | Removed in Phase 12 |
| 4 | Portal pages still show mock data for real users | Expected — each page migrates in its own phase (5–11) | Do not fix early |

---

## Next step

**Phase 5 — Parent: children, enrolment, class booking (credit loop)**

When ready, say **"ready for Phase 5"**.
