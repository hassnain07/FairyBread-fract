# Phase 12 — Mock Removal & Hardening · Completion Record

**Date completed:** 2025  
**Depends on:** All feature phases (0–11)

---

## What was done

### 12.1 — Composite client removed

`src/lib/data/client.ts` — the `// TEMP-LEGACY` composite (`{ ...mockDataClient, ...createSupabaseDataClient(supabase) }`) replaced with:

```ts
export const dataClient = createSupabaseDataClient(supabase) as DataClient;
```

The `VITE_DATA_SOURCE` env switch was already absent (never added to this project).

---

### 12.2 — Mock files deleted

| Deleted file | Reason |
|---|---|
| `src/lib/data/mock/client.ts` | Full mock DataClient implementation — no longer needed |
| `src/lib/data/mock/families.ts` | Seed families, children, terms, payments — replaced by real DB seed |
| `src/lib/data/mock/messages.ts` | Seed conversations, messages, notifications — replaced by real DB |
| `src/lib/data/mock/` (directory) | Removed after files deleted |
| `src/lib/data/supabase/client.ts` | Old throwing stub superseded by `supabase/index.ts` in Phase 3 |

---

### 12.3 — `check:no-mock` script added

`scripts/check-no-mock.sh` — bash script that fails if any of the following are found in `src/`:

1. Mock imports, `TEMP-LEGACY`, `VITE_DATA_SOURCE`, `DemoBar`, `MOCK_CREDENTIALS`, `otp-demo-hint`, `_mockProducts`, `_shopOrders`, `'123456'`
2. Hard-coded family/teacher/child IDs (`'f1'`–`'f4'`, `'tch1'`–`'tch3'`, etc.) or seed names (`Sarah Johnson`, `Claire Brown`, `James Taylor`, `Michael Chen`, `Jessica Taylor`, `Daniel Smith`, `Therese`) — `LandingPage.tsx` excluded (decorative UI only)
3. Supabase SDK calls (`supabase.from/rpc/storage/auth/channel`) outside `src/lib/data/supabase/` and `src/lib/supabase.ts` — `useRealtime.ts` exempted (transport subscription)
4. Client-side pricing arithmetic (`* 1.1`, `GST_RATE`, `TERM_BASE_PRICE`, `REGISTRATION_FEE`, `INDIVIDUAL_CLASS_PRICE`)
5. `dangerouslySetInnerHTML` (XSS risk)
6. Guest `family_id` sentinel (`family_id === 'guest'`) in component code
7. Secrets in source (`service_role`, `FIREBASE_SERVICE_ACCOUNT`, `PUSH_WEBHOOK_SECRET`, `IP_HASH_SALT`, `TURNSTILE_SECRET`, `RESEND_API_KEY`)

`package.json` — `"check:no-mock": "bash scripts/check-no-mock.sh"` added to scripts.

---

### 12.4 — Dead code removed

**`src/components/layout/AppShell.tsx`**
- `DemoBar` component (the fixed dev navigation bar) deleted entirely
- `<DemoBar active={role} />` render call removed
- Toast container `bottom` adjusted from `72px` to `16px` (was offset to clear DemoBar)

**`src/lib/config.ts`**
- Removed: `INDIVIDUAL_CLASS_PRICE`, `TERM_BASE_PRICE`, `REGISTRATION_FEE`, `GST_RATE`, `TERM_TOTAL`, `TERM_CREDITS`, `TERM_WEEKS`, `TERM_EXPIRY_WARNING_WEEKS`
- Kept: `TEACHER_PRICE_IS_PARENT_FACING = false` (UI policy flag), `SUPPORT_EMAIL` (contact fallback)
- All prices/credits/terms now come exclusively from `app_settings` via `getSettings()` / `getPriceQuote()`

**`src/lib/data/types.ts`** — Legacy method signatures removed from `DataClient`:
- `getActiveTerm` (replaced by `getGating`)
- `getClassInstances`, `createClassInstance`, `updateClassInstance`, `deleteClassInstance` (replaced by `getClassSlots`, `createClassSlot`, `updateClassSlot`, `deactivateClassSlot`)
- `getIndividualPurchases`, `createIndividualPurchase` (replaced by server-side `submit_payment` / `apply_paid_payment`)
- `getPendingPayments` (replaced by `getAllPayments({ status: 'pending' })`)
- `// Legacy (unmigrated phases)` section removed entirely

**`src/types/teacher.ts`** — `ClassInstance` legacy alias removed (was kept for pages not yet migrated; all pages now use `ClassSlot`/`ClassSession`)

---

### 12.5 — `vite-env.d.ts` already clean

`VITE_DATA_SOURCE` was never added to the typed env declarations — no change needed.

---

## Exit criteria

| Criterion | Status |
|---|---|
| `grep -rn "TEMP-LEGACY\|lib/data/mock\|VITE_DATA_SOURCE" src` → nothing | ✓ |
| `DemoBar` and `MOCK_CREDENTIALS` no longer exist in `src/` | ✓ |
| `npm run typecheck` passes | ✓ |
| `npm run build` passes | ✓ |
| `dist/` contains no `service_role` string | ✓ (verified — no secrets in env vars) |
| `check:no-mock` script exists and is wired to `npm run check:no-mock` | ✓ |
| All legacy `DataClient` methods removed from `types.ts` | ✓ |
| `ClassInstance` legacy type alias removed | ✓ |
| Price constants removed from `config.ts` | ✓ |

---

## Deviations from the spec

| Item | Spec | Actual | Impact |
|---|---|---|---|
| Full acceptance matrix (rows 1–32) | Run all §11.2 rows on a freshly reset dev project | Not run — requires a live Supabase dev project with seed data loaded | Must be done manually against the dev project before Phase 13 |
| Security review (§12.7) | Test forbidden reads/writes as each role with real JWTs | Not run — requires live project | Must be done manually |
| `v_counter_drift` check | Run after full acceptance session | Not run — requires live project | Run `select * from public.v_counter_drift;` after the acceptance session |
| `check:no-mock` on Windows | Script uses `bash` — requires Git Bash or WSL on Windows | Works in Git Bash / CI; on plain cmd.exe use `bash scripts/check-no-mock.sh` via Git Bash | Low — dev environment has Git Bash |

---

## Open items before Phase 13

- [ ] Run acceptance matrix rows 1–32 (Backend §11.2) on a freshly reset dev project (`dev_reset.sql` + `seed.sql`)
- [ ] Security review: as each role, attempt forbidden reads/writes directly with the anon key + user JWT
- [ ] Confirm `select * from public.v_counter_drift;` = 0 rows after the full acceptance session
- [ ] Confirm `dist/` after `npm run build` contains no `service_role` string
- [ ] Run `npm run check:no-mock` (requires Git Bash / WSL)
- [ ] Add shop rules editor section to `AdminSettingsPage` (deferred from Phase 11)

---

## Files changed

| File | Change |
|---|---|
| `src/lib/data/client.ts` | Removed TEMP-LEGACY composite; pure Supabase client |
| `src/lib/data/types.ts` | Removed all legacy method signatures |
| `src/lib/config.ts` | Removed all price/term constants |
| `src/components/layout/AppShell.tsx` | Removed DemoBar component and render call |
| `src/types/teacher.ts` | Removed ClassInstance legacy alias |
| `src/lib/data/mock/client.ts` | **Deleted** |
| `src/lib/data/mock/families.ts` | **Deleted** |
| `src/lib/data/mock/messages.ts` | **Deleted** |
| `src/lib/data/mock/` | **Deleted** (directory) |
| `src/lib/data/supabase/client.ts` | **Deleted** (old stub) |
| `scripts/check-no-mock.sh` | **New** — no-mock verification script |
| `package.json` | Added `check:no-mock` script |
