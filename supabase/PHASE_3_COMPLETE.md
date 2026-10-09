# Phase 3 — Client Foundation: Completion Record

**Status:** ✅ Complete  
**Date completed:** 2025  
**Branch:** `main`  
**Depends on:** Phase 2 complete (all migrations applied, seed loaded)

---

## What Phase 3 covered

Added all the infrastructure every later phase uses — Supabase client factory, error handling, query keys, money/id utilities, auth types, and the composite data client — without changing any screen. The app still runs entirely on mock data. No SQL was run.

---

## Task-by-task record

### 3.1 `src/lib/supabase.ts` — ✅

`createAppSupabase(url, key, opts)` factory + the one exported `supabase` instance. The only file that reads `import.meta.env` for backend config. Accepts an optional `storage` adapter and `detectSessionInUrl` flag so the React Native app can reuse everything else.

### 3.2 `src/lib/data/errors.ts` — ✅

`AppError` class + full `COPY` table covering all RPC error codes from Schema §8 and §13A (business, OTP, shop). `toAppError(e)` maps Supabase/PostgREST errors to friendly human text. Every data-layer method will use `if (error) throw toAppError(error)`.

### 3.3 `src/lib/data/queryKeys.ts` — ✅

`qk` factory with keys for every domain: families, children, terms, sessions, bookings, payments, assessments, reports, attendance, conversations, notifications, admin stats, and all shop keys. Used by every `useQuery` / `useMutation` / `invalidateQueries` call.

### 3.4 Utilities — ✅

- `src/lib/utils/money.ts` — `formatMoney(cents)` using `Intl.NumberFormat('en-AU', { style:'currency', currency:'AUD' })`. All price display goes through this; no component does `* 1.1` arithmetic.
- `src/lib/utils/id.ts` — `newId()` wrapping `crypto.randomUUID()`. React Native can swap in `expo-crypto` without touching callers.

### 3.5 `src/types/auth.ts` — ✅

`Role` and `AuthUser` types in their own file. Fixes the circular import: `AppShell.tsx` previously defined `Role` and `providers.tsx` imported from it. Now both import from `types/auth.ts`. `AppShell.tsx` re-exports `Role` for any existing consumers.

### 3.6 Supabase data-client skeleton — ✅

Folder layout created:

```
src/lib/data/supabase/
  database.types.ts   (placeholder — existed from Phase 0)
  index.ts            createSupabaseDataClient(sb) → returns {} (Phase 3 skeleton)
  rpc.ts              typed rpc<T>(sb, fn, args) wrapper → throws toAppError on error
  mappers.ts          toChild() mapper (shell; grows each phase)
```

### 3.7 Composite client — ✅

`src/lib/data/client.ts` updated:

```ts
export const dataClient = {
  ...mockDataClient,
  ...createSupabaseDataClient(supabase),
} as DataClient; // TEMP-LEGACY
```

`VITE_DATA_SOURCE` switch removed. The mock remains the fallback for every method until its phase migrates it. Phase 12 removes the composite entirely.

### 3.8 ErrorBoundary — ✅

`ErrorBoundary` class component added to `src/app/providers.tsx`, wrapping all children. Shows a friendly "Something went wrong" screen with a "Try again" button on unhandled render errors.

---

## Exit criteria check

| Criterion | Result |
|---|---|
| App behaves exactly as before (mock data, DemoBar still present) | ✅ |
| `npm run build` exits 0, no TypeScript errors | ✅ |
| `grep -rn "TEMP-LEGACY" src` finds exactly one place (`src/lib/data/client.ts`) | ✅ |
| `src/lib/supabase.ts` is the only file reading `import.meta.env` for backend config | ✅ |
| `Role` type no longer defined in `AppShell.tsx` — imported from `types/auth.ts` | ✅ |

---

## Files created / modified

| File | Change |
|---|---|
| `src/lib/supabase.ts` | NEW — Supabase client factory |
| `src/lib/data/errors.ts` | NEW — AppError + toAppError |
| `src/lib/data/queryKeys.ts` | NEW — qk factory |
| `src/lib/utils/money.ts` | NEW — formatMoney |
| `src/lib/utils/id.ts` | NEW — newId |
| `src/types/auth.ts` | NEW — Role + AuthUser |
| `src/lib/data/supabase/index.ts` | NEW — createSupabaseDataClient skeleton |
| `src/lib/data/supabase/rpc.ts` | NEW — typed rpc wrapper |
| `src/lib/data/supabase/mappers.ts` | NEW — toChild mapper shell |
| `src/lib/data/client.ts` | UPDATED — composite TEMP-LEGACY client, VITE_DATA_SOURCE removed |
| `src/app/providers.tsx` | UPDATED — ErrorBoundary added, imports Role from types/auth.ts |
| `src/components/layout/AppShell.tsx` | UPDATED — imports Role from types/auth.ts, re-exports it |

No SQL was run. No migration files were changed. `MIGRATIONS_LOG.md` unchanged.

---

## Browser console verification (do once after `npm run dev`)

Open the browser console and run:

```js
// Should return only public_info and shop rows (anon RLS)
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const { data } = await sb.from('app_settings').select('key');
console.log(data); // expect [{key:'public_info'},{key:'shop'}]

// Should return empty or error (anon cannot read payments)
const { data: p, error: pe } = await sb.from('payments').select();
console.log(p, pe); // expect null + RLS error
```

---

## Next step

**Phase 4 — Authentication (real login, OTP signup, forgot password)**

Phase 4 replaces the mock `AuthContext` in `providers.tsx` with a real Supabase-backed `AuthProvider`, wires `LoginPage`, `SignupPage`, `ForgotPasswordPage`, and `OtpInput` to real Supabase auth calls, adds `RequireRole` route guards, and removes the `DemoBar`.

Prerequisites before starting Phase 4:
1. Custom SMTP configured (OTP emails must reach external inboxes) ⚠️ still pending from Phase 0
2. All Phase 2 checkpoint queries still pass ✅
3. `npm run build` exits 0 ✅

When ready, say **"ready for Phase 4"**.
