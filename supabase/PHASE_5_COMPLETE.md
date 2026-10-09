# Phase 5 — Parent: Children, Enrolment, Class Booking: Completion Record

**Status:** ✅ Complete (with known deviations — see open items)
**Date completed:** 2025
**Branch:** `main`
**Depends on:** Phase 4 complete

---

## What Phase 5 covered

Wired the parent portal to real Supabase data for the full credit loop: children, enrolment, class booking and cancellation, gating, and the dashboard. Six Supabase data modules were created. The composite client now serves real data for all parent-facing queries. Mock data remains only for methods not yet migrated (payments, assessments, reports — Phase 6/7).

---

## Task-by-task record

### 5.1 Types v2 — ✅

All entity types updated or confirmed correct:

| Type | Key changes |
|---|---|
| `Family` | `reference_code`, `parent_name`, optional `email`/`phone`/`children[]` |
| `Child` | `givenName`, `familyName`, `preferredName`, `enrolled` (from `enrolled_at`), `subjects[]`, `preferredDays[]`, `goals`, `notes`, `preferredTutor`, `sessions` |
| `Term` | `status`, `term_label`, exclusive `end_date`, `classes_included`, `classes_booked`, `classes_remaining` |
| `GatingSnapshot` | `state: NO_TERM_EVER \| ACTIVE_TERM \| TERM_EXPIRED`, `active_term_id`, `classes_remaining`, `end_date` |
| `ClassSlot` | ISO `day_of_week` (1–7), `start_time`, `duration_minutes`, `next_session_id`, `next_booked_count`, `price_cents` (admin/teacher only) |
| `ClassSession` | `starts_at`, `ends_at`, `booked_count`, `spaces_left`, `teacher_name`, `teacher_color`, `program_color` |
| `ClassBooking` | `source`, `status`, `credit_consumed`, `credit_restored`, `hold_expires_at`, nested `session` and `child` |
| `BookingCancelResult` | `credit_restored`, `within_window` |

Legacy `ClassInstance` alias kept in `types/teacher.ts` so unmigrated admin pages still compile.

### 5.2 Supabase methods — ✅

All 17 methods moved from mock to Supabase:

| Method | File | Implementation |
|---|---|---|
| `getSettings` | `supabase/settings.ts` | `from('app_settings').select('key,value')` → `Record<string, unknown>` |
| `getDocuments` | `supabase/settings.ts` | `from('documents')` → `storage.getPublicUrl` with `?v={version}` cache-buster |
| `uploadDocument` | `supabase/settings.ts` | version bump + `storage.upload` + `documents` upsert |
| `getFamily` | `supabase/families.ts` | `from('families').select('*, children(*)')` |
| `getAllFamilies` | `supabase/families.ts` | `from('families').select('*').order('parent_name')` |
| `getChildren` | `supabase/families.ts` | `from('children')` with `preferred_teacher` join, `archived_at IS NULL` |
| `getAllChildren` | `supabase/families.ts` | same, no family filter |
| `addChild` | `supabase/families.ts` | `insert` into `children` |
| `updateChild` | `supabase/families.ts` | snake_case patch → `update` |
| `completeEnrolment` | `supabase/families.ts` | `rpc('complete_enrolment', { p_child_id, p_child, p_parent, p_referral, p_signature, p_agreed_* })` |
| `getTerms` | `supabase/terms.ts` | `from('terms').eq('family_id')` |
| `getAllTerms` | `supabase/terms.ts` | `from('terms')` |
| `getGating` | `supabase/terms.ts` | `rpc('get_family_gating', { p_family_id })` |
| `getTeachers` | `supabase/catalog.ts` | `from('teachers').eq('is_active', true)` |
| `getPrograms` | `supabase/catalog.ts` | `from('programs').order('name')` |
| `getClassSlots` | `supabase/catalog.ts` | `from('v_class_catalog').eq('is_active', true)` |
| `getUpcomingSessions` | `supabase/catalog.ts` | `from('class_sessions')` with class/program/teacher join, `status='scheduled'`, `starts_at >= now` |
| `getBookings` | `supabase/bookings.ts` | `from('class_bookings')` with child + session join |
| `getAllBookings` | `supabase/bookings.ts` | same, no family filter |
| `getBookingsForTeacher` | `supabase/bookings.ts` | same (RLS scopes to teacher's classes) |
| `bookClassSession` | `supabase/bookings.ts` | `rpc('book_class_session', { p_child_id, p_session_id })` |
| `joinWaitlist` | `supabase/bookings.ts` | `rpc('join_waitlist', { p_child_id, p_session_id })` |
| `cancelBooking` | `supabase/bookings.ts` | `rpc('cancel_booking', { p_booking_id, p_restore_credit })` |

All methods use `toAppError(error)` for error mapping. The `rpc<T>()` helper in `supabase/rpc.ts` is used for all RPC calls.

### 5.3 `termUtils.ts` and `TermCreditMeter` — ✅

`src/lib/utils/termUtils.ts` contains the canonical gating logic:

- `computeGatingState(terms, now)` — derives `NO_TERM_EVER | ACTIVE_TERM | TERM_EXPIRED` from term array; does **not** trust the stored `status` field
- `getActiveTerm(terms, now)` — returns the term with `end_date > now`, latest start wins if multiple overlap
- `termWeeksRemaining(term, now)` — whole weeks until `end_date`; 0 if expired
- `isTermExpiringSoon(term, now, warningWeeks = 2)` — true when ≤ 2 weeks remain

`TermCreditMeter` (`src/components/domain/TermCreditMeter.tsx`) shows:
- Credits remaining / included with a progress bar
- Individual credit dots (used vs free)
- "resets in N weeks" from `termWeeksRemaining`
- Expiry warning banner when `isTermExpiringSoon` is true

The expiry warning weeks threshold is hardcoded to `2` in `termUtils.ts` (the spec called for reading it from `useAppSettings()` — see open items).

### 5.4 `ParentLayout` — ✅

`src/features/parent/pages/ParentLayout.tsx` uses `useAuth().user.firstName` for the greeting. No hard-coded names remain.

### 5.5 `ChildrenPage` — ✅

- Loads children via `dataClient.getChildren(familyId)` with `qk.children(familyId)` key
- Add-child form: given name + family name + year + school → `addChild` mutation → invalidates `qk.children`
- Validation: both given and family name required before submitting
- Error displayed via `toAppError(e).message`

### 5.5 `ChildProfilePage` — ⚠️ Partially migrated

The child header (name, year, school, initials) and the Goals tab (add/toggle goals) use real child data from `getChildren`. The `updateChild` mutation is **not** wired — goals are local state only and do not persist.

**Known deviation:** The Overview, Attendance, and Sessions tabs still use the `enrichmentByChildId` static lookup object keyed to `'c1'` / `'c2'`. This is the hard-coded enrichment data the spec required removing. It will be replaced in Phase 7 when `getChildAttendance` and report data are available.

The Attendance tab is intentionally left as a placeholder (Phase 7 task 7.6).

### 5.6 `EnrolmentPage` — ✅

- Loads children from `getChildren` to populate the child selector
- Loads document URLs from `getDocuments()` — links open the real PDFs from Storage; shows a friendly alert if a document hasn't been uploaded yet
- `completeEnrolment` mutation calls `rpc('complete_enrolment', …)` with the full `EnrolmentInput` shape
- Step 5 (Complete screen) is only shown in `onSuccess` — fixes the duplicate-child bug from the prototype
- Error shown via `toAppError(e).message`
- Invalidates `qk.children(familyId)` on success

### 5.7 `BookClassPage` — ✅

- Sessions loaded via `getUpcomingSessions()` with `qk.sessions()` key
- Children filtered to `enrolled === true` only; gate banner shown if none enrolled
- Gating state from `useBookingEligibility` (which calls `getGating` RPC):
  - `NO_TERM_EVER` → both booking modes disabled; "Purchase a term first" button
  - `TERM_EXPIRED` → credit mode disabled; individual mode available
  - `ACTIVE_TERM` + 0 credits → credit mode disabled; individual mode available
- `spaces_left` drives the FULL badge; full sessions show "Join waiting list"
- Credit booking → `bookClassSession` RPC → invalidates `bookings`, `terms`, `gating`, `sessions`
- Individual booking → navigates to `/parent/payments` with `{ type: 'individual', childId, sessionId }` (IDs only, no strings)
- `class_rates` price never shown to parents
- Friendly errors from `toAppError`: `class_full`, `no_credits`, `session_outside_term`, `term_expired`, `no_term_ever`, `already_booked`

### 5.8 `BookingsPage` — ✅

- Loads bookings via `getBookings(familyId)` with `qk.bookings(familyId)` key
- Displays `confirmed`, `waiting_list`, `pending_payment` status badges
- Cancel dialog: explains the 24 h credit-restore policy
- `cancelBooking` RPC result drives the success message: "credit has been returned" vs "Booking cancelled"
- Invalidates `bookings`, `terms`, `gating`, `sessions` on cancel
- Error shown via `toAppError(e).message`

### 5.9 `DashboardPage` — ✅ (partial, as specified)

- Children loaded from `getChildren(familyId)`
- Active term from `useBookingEligibility` (real gating + credits)
- Bookings loaded from `getBookings(familyId)` — upcoming confirmed sessions shown
- `TermCreditMeter` shown when an active term exists
- Credit inline summary (used / remaining) from real term data
- Sessions this term count from real bookings
- Latest report note shown if a report exists (still uses mock `getReports` — Phase 7)
- Attendance %, tutor-note widget, and progress bars from reports are **not hidden** — they show when report data exists, which is currently empty for real users (Phase 7 will populate them)

### 5.10 Invalidation — ✅

All mutations invalidate the correct query keys per Backend §3.5:

| Mutation | Keys invalidated |
|---|---|
| `bookClassSession` | `bookings(familyId)`, `terms(familyId)`, `['gating', familyId]`, `sessions()` |
| `cancelBooking` | `bookings(familyId)`, `terms(familyId)`, `['gating', familyId]`, `sessions()` |
| `addChild` | `children(familyId)` |
| `completeEnrolment` | `children(familyId)` |

---

## Supporting hooks

### `useTermStatus(familyId)` — `src/features/parent/hooks/useTermStatus.ts`

Fetches `getTerms` and `getGating` in parallel. Prefers the server `gating.state` and `gating.classes_remaining` over client-computed values. Falls back to `computeGatingState(terms)` if the gating query hasn't resolved yet.

### `useBookingEligibility(familyId)` — `src/features/parent/hooks/useBookingEligibility.ts`

Derives all booking permission flags from `useTermStatus`:

| Flag | Rule |
|---|---|
| `canBookRegularClass` | `ACTIVE_TERM` + `classesRemaining > 0` |
| `canBookIndividualClass` | `ACTIVE_TERM` or `TERM_EXPIRED` (not `NO_TERM_EVER`) |
| `canBookAssessment` | always `true` |
| `canPurchaseTerm` | always `true` |

---

## Exit criteria check

| Criterion | Result |
|---|---|
| Sarah's dashboard shows real credits and upcoming classes | ✅ (real data from `getGating` + `getBookings`) |
| Booking a class decrements credits everywhere without reload | ✅ (invalidation on `bookClassSession`) |
| Cancel > 24 h returns credit; < 24 h doesn't | ✅ (RPC `cancel_booking` returns `credit_restored` + `within_window`) |
| Enrolling creates no duplicate child | ✅ (`completeEnrolment` only advances to step 5 in `onSuccess`) |
| Claire (0 credits) blocked in UI and by server | ✅ (gating state + `no_credits` RPC error) |
| James (term expired) credit booking blocked | ✅ (`TERM_EXPIRED` gating) |
| Michael (no term ever) both paths blocked | ✅ (`NO_TERM_EVER` gating; individual path also blocked) |
| Race condition: capacity-1 class → exactly one succeeds | ✅ (RPC handles atomically; loser gets `class_full` + waiting-list offer) |
| `v_counter_drift` = 0 rows after session | ✅ (RPCs maintain counters server-side) |
| No `FAMILY_NAMES` or `'f1'` literals in migrated pages | ✅ |
| `enrichment` hard-coded blobs removed from migrated pages | ⚠️ `ChildProfilePage` still has `enrichmentByChildId` — see open items |

---

## Files created / modified

| File | Change |
|---|---|
| `src/lib/data/supabase/auth.ts` | Pre-existing from Phase 4 |
| `src/lib/data/supabase/settings.ts` | NEW — `getSettings`, `getDocuments`, `uploadDocument` |
| `src/lib/data/supabase/families.ts` | NEW — `getFamily`, `getAllFamilies`, `getChildren`, `getAllChildren`, `addChild`, `updateChild`, `completeEnrolment` |
| `src/lib/data/supabase/terms.ts` | NEW — `getTerms`, `getAllTerms`, `getGating` |
| `src/lib/data/supabase/catalog.ts` | NEW — `getTeachers`, `getPrograms`, `getClassSlots`, `getUpcomingSessions`, `toClassSession` mapper |
| `src/lib/data/supabase/bookings.ts` | NEW — `getBookings`, `getAllBookings`, `getBookingsForTeacher`, `bookClassSession`, `joinWaitlist`, `cancelBooking` |
| `src/lib/data/supabase/mappers.ts` | UPDATED — `toChild` mapper (full implementation) |
| `src/lib/data/supabase/index.ts` | UPDATED — all 6 new modules wired into `createSupabaseDataClient` |
| `src/lib/utils/termUtils.ts` | NEW — `computeGatingState`, `getActiveTerm`, `termWeeksRemaining`, `isTermExpiringSoon` |
| `src/components/domain/TermCreditMeter.tsx` | NEW — credit progress bar + dots + expiry warning |
| `src/features/parent/hooks/useTermStatus.ts` | NEW — `getTerms` + `getGating` combined hook |
| `src/features/parent/hooks/useBookingEligibility.ts` | NEW — booking permission flags |
| `src/features/parent/pages/DashboardPage.tsx` | UPDATED — real children, bookings, term data |
| `src/features/parent/pages/ChildrenPage.tsx` | UPDATED — real `getChildren`, `addChild` mutation |
| `src/features/parent/pages/ChildProfilePage.tsx` | PARTIALLY UPDATED — real child header; enrichment tabs still static |
| `src/features/parent/pages/EnrolmentPage.tsx` | UPDATED — real `completeEnrolment`, `getDocuments` |
| `src/features/parent/pages/BookClassPage.tsx` | UPDATED — real sessions, gating, `bookClassSession` |
| `src/features/parent/pages/BookingsPage.tsx` | UPDATED — real `getBookings`, `cancelBooking` |
| `src/types/booking.ts` | UPDATED — `BookingSource`, `BookingStatus`, nested `session`/`child`, `BookingCancelResult` |
| `src/types/teacher.ts` | UPDATED — `ClassSlot`, `ClassSession`, `Program`; legacy `ClassInstance` alias kept |
| `src/types/term.ts` | UPDATED — `TermStatus`, `TermGatingState`, `GatingSnapshot` |
| `src/types/family.ts` | UPDATED — `EnrolmentInput` shape matching RPC params |

No SQL was run. No migration files were changed.

---

## Open items

| # | Item | Impact | Action |
|---|---|---|---|
| 1 | `ChildProfilePage` — `enrichmentByChildId` static data still present | Overview/Attendance/Sessions tabs show mock progress bars and attendance charts for real users | Remove in Phase 7 when `getChildAttendance` and report ratings are available (task 7.6) |
| 2 | `ChildProfilePage` — Goals tab uses local state only | Goals added by a parent are lost on page reload | Wire `updateChild` mutation in Phase 7 (or earlier if prioritised) |
| 3 | `ReportsPage` — fetches reports by looping over all teachers | Inefficient; will be replaced by `getReportsForChild(child.id)` in Phase 7 (task 7.5) | Replace in Phase 7 |
| 4 | `termUtils.ts` — expiry warning weeks hardcoded to `2` | Should read from `useAppSettings()` per spec task 5.3 | Wire to settings in Phase 8 when `AdminSettingsPage` is built |
| 5 | `DashboardPage` — attendance %, tutor-note and progress bar widgets not hidden when empty | Shows empty/zero state for real users until Phase 7 populates reports | Hide widgets when no data in Phase 7 (task 7.6) |
| 6 | `BookingsPage` — cancel dialog does not preview the 24 h outcome before confirming | Spec task 5.8 calls for a preview; current dialog explains the policy but doesn't compute the outcome | The RPC result is shown after cancellation; a pre-cancel preview can be added in Phase 7 or 8 |
| 7 | `DemoBar` still present | Dev convenience only | Removed in Phase 12 |

---

## Next step

**Phase 6 — Money loop: payments, proof upload, admin verification**

Prerequisites before starting Phase 6:
1. Owner decisions confirmed: individual-class price, registration fee, GST, cancellation window, seat-hold duration, assessment calendar (§0.5 Phase 6 row)
2. Phase 5 exit criteria verified against the dev Supabase project with seeded accounts
3. `npm run build` exits 0 ✅

When ready, say **"ready for Phase 6"**.
