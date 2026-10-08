# Phases — Fairybread & Fractions

> Recommended build/fix roadmap with **exact changes** per phase. Do phases in order; finish and verify one before starting the next.
> If the owner gives a specific task, that task wins — use this file to see which phase it belongs to and which rules/files it touches.
> Always follow `rules.md` §8 (Definition of done) at the end of every item.
> Status of what already exists is in `memory.md`.

Legend: 🐞 bug fix · 🧱 structure · ✨ feature · 🔒 security · 🧹 cleanup

---

## Phase 0 — Hygiene & safety net (small, do first)

| # | Type | Change | Files |
|---|---|---|---|
| 0.1 | 🧹 | Rename package from `vite-react-typescript-starter` to `fairybread-and-fractions` | `package.json` |
| 0.2 | 🧹 | Replace Bolt OG/Twitter image tags and the non-existent `/vite.svg` favicon with the real logo (`/assets/image.png`); set a proper `<title>` | `index.html` |
| 0.3 | 🧹 | Delete dead "Proposal", "Why matters", "Journey", "Before/After", "Platform", "Stack", "Lists", "Investment", "Proposal end" CSS sections | `src/index.css` (sections around the `/* Proposal */ … /* Proposal end */` comments) |
| 0.4 | 🧹 | Remove `onSwitchRole` and `onHome` from `AppShell` props **or** implement them — they are passed by all three layouts but never used | `components/layout/AppShell.tsx`, `ParentLayout.tsx`, `AdminLayout.tsx`, `TeacherLayout.tsx` |
| 0.5 | 🧱 | Add `.env.example` (`VITE_DATA_SOURCE=mock`, `VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=`); add `.env` to `.gitignore` | repo root |
| 0.6 | 🧱 | Gate the `DemoBar` and the "Demo credentials" box behind `import.meta.env.DEV` (or `VITE_DEMO_MODE=true`) so they never ship | `AppShell.tsx`, `LoginPage.tsx` |
| 0.7 | 🧱 | Add an app-level React error boundary around `<AppRouter/>` | `src/app/providers.tsx` or new `src/app/ErrorBoundary.tsx` |
| 0.8 | 🐞 | Add `/forgot-password` route + minimal page (mock: "we've emailed you"), or remove the link | `router.tsx`, `LoginPage.tsx`, new `features/auth/pages/ForgotPasswordPage.tsx` |
| 0.9 | 🧱 | Fix the circular type import: `Role` is exported from `AppShell.tsx` and imported by `providers.tsx`, while `AppShell` imports `useAuth` from `providers`. Move `Role` to `src/types/auth.ts` | `providers.tsx`, `AppShell.tsx`, new `types/auth.ts` |

**Exit check:** typecheck/lint/build green; app looks identical.

---

## Phase 1 — Fix core data-layer bugs (highest value)

### 1.1 🐞 Persist credit bookings (the biggest bug)
`BookClassPage` credit path only does `setBookedClass(...)`; nothing is saved.
- In `features/parent/pages/BookClassPage.tsx`, replace the `usingCredit` branch of the "Confirm booking" button with a `useMutation` that calls
  `dataClient.createBooking({ family_id: familyId, child_id: selectedChild.id, class_instance_id: confirming.id, source: 'term_credit', status: 'confirmed', credit_consumed: true })`.
- `onSuccess`: invalidate `['bookings', familyId]`, `['terms', familyId]`, `['classInstances']`; then close the modal and show the "Booked" state.
- `onError`: show an inline error (see `rules.md` §5).
- Guard server-side too: in `mock/client.ts → createBooking`, throw if `source==='term_credit'` and the family has no active term or `classes_remaining === 0` (prevents double-spend even if UI is bypassed).
- Replace the local `classes` array in this file with `useQuery(['classInstances'], dataClient.getClassInstances)` joined with `getTeachers()`; compute "spaces available" from `capacity - enrolled`, and show `FULL` when `enrolled >= capacity`. `createBooking` must increment the class's `enrolled`.

### 1.2 🐞 Enrolment must update, not duplicate
`EnrolmentPage.completeEnrolment` calls `dataClient.addChild(...)` with an existing child → creates a duplicate.
- Add `updateChild(childId: string, patch: Partial<Child>): Promise<Child>` to `lib/data/types.ts`, implement in `mock/client.ts` (map over `_children`; **also** keep `mockFamilies[].children` consistent or stop reading children from `Family`), add stub in `supabase/client.ts`.
- In `EnrolmentPage.tsx`, convert to a `useMutation` calling `updateChild`; call `setStep(6)` in `onSuccess`, not immediately.

### 1.3 🐞 Cancellation window (24h rule)
UI says "Cancel 24+ hours before to restore your credit" but `mock/client.ts → cancelBooking` always restores.
- Extend `ClassBooking` with the session start datetime (or resolve it from `ClassInstance` + date). Add a `sessionStart` ISO field to bookings.
- `cancelBooking(bookingId)` returns `{ creditRestored: boolean }`. Restore a credit **only** if `sessionStart - now >= 24h` **and** `source==='term_credit'` **and** `credit_consumed`. Otherwise cancel without restoring.
- Add `CANCELLATION_WINDOW_HOURS = 24` to `lib/config.ts` (with `// TODO: confirm with client`).
- `BookingsPage.tsx` / `AdminBookingsPage.tsx`: show in the cancel dialog whether the credit will be restored (compute with the same config value) and decrement `classes_included`-based meters accordingly.
- Also decrement the class's `enrolled` on cancel.

### 1.4 🐞 Term activation on early renewal
`mock verifyPayment` only creates a term `if (!existing)` (active). Renewing while active silently does nothing.
- Decide rule (ask owner, default: new term **starts when the current one ends**, 10 fresh credits; remaining credits of the old one do not roll over). Implement in `verifyPayment`; set `start_date = max(now, activeTerm.end_date)`.
- Record the `term_label` from the payment on the Term.
- Update `computeGatingState`/`getActiveTerm` only if a *future-starting* term must count (currently `end_date > now` counts it as active even before it starts — decide and document).

### 1.5 🐞 Assessment payments use the wrong type
`BookAssessmentPage` submits `type:'individual_class'` with `class_subject:'Assessment'`.
- Add `'assessment'` to `PaymentType` in `types/payment.ts`; use it in `BookAssessmentPage`.
- Update every place that branches on `payment.type`: `PaymentsPage` (card + detail modal), `AdminPaymentsPage` (type badge/details column), `AdminParentsPage` if applicable. `verifyPayment` on approve of an assessment should set the matching `Assessment` as paid/confirmed.
- Add `ASSESSMENT_PRICE` to `lib/config.ts` (`// TODO: confirm with client`) and use it instead of `INDIVIDUAL_CLASS_PRICE` in `BookAssessmentPage` (lines ~10–13).

### 1.6 🧱 Add "all" queries so pages stop looping over fake IDs
Add to `DataClient` + mock + stub: `getAllChildren()`, `getAllBookings()`, `getAllPayments()`, `getAllTerms()`.
Then delete every `ALL_FAMILY_IDS` / `ALL_IDS` constant and rewrite those queries:
- `admin/pages/AdminBookingsPage.tsx` (line ~7)
- `admin/pages/AdminPaymentsPage.tsx` (inline `ALL_FAMILY_IDS`)
- `admin/pages/AdminParentsPage.tsx` (`ALL_IDS`)
- `teacher/pages/TeacherAssessmentsPage.tsx`, `TeacherAttendancePage.tsx`, `TeacherReportsPage.tsx`, `TeacherStudentsPage.tsx`
For teacher pages, prefer teacher-scoped methods: `getBookingsForTeacher(teacherId)` / `getStudentsForTeacher(teacherId)`.

### 1.7 🐞 Notifications are never created
Add `createNotification(n)` to `DataClient`. Call it from the mock inside:
- `createBooking` → `booking_confirmed` (to family) 
- `cancelBooking` → `booking_cancelled`
- `submitPayment` → `payment_received` (to admin; add admin audience) 
- `verifyPayment` → `payment_approved` / `payment_rejected`
- `createReport` → `report_ready`
- `sendMessage` → `message_received` for the other participant
Invalidate `['notifications', …]` in the corresponding mutations.

**Exit check:** book by credit as `f1` → credit meter goes 3→2 on dashboard, book-class and bookings; cancel <24h → no credit; cancel ≥24h → credit back; enrol child → no duplicate; admin payment page shows assessment payments with the correct type.

---

## Phase 2 — Remove all hard-coded identity and data

### 2.1 🔒🧱 Real-shaped auth context
Rewrite `app/providers.tsx` `AuthContext` to expose `{ user: { id, name, email, role, familyId?, teacherId? } | null, signIn, signOut }`.
- Mock `signIn` looks up the existing credential map **moved into `lib/data/mock/users.ts`** (not inside `LoginPage`). Persist the mock session in `sessionStorage` (acceptable exception for mock auth only).
- Remove `setRole`/`setFamilyId` setters from the public context (they are what the DemoBar and signup abuse).
- Add `<RequireRole role="parent|admin|teacher">` wrapper; use it in `router.tsx` around each of the three route groups; unauthenticated → `/login`, wrong role → own home.
- `LoginPage.tsx`: call `signIn`, redirect by role.
- `SignupPage.tsx` (line ~87): stop doing `setFamilyId('f4')`. Add `createFamily({ parentName, email, phone })` to `DataClient`; sign the user in with the new family id.

### 2.2 Replace hard-coded names/ids with context data
- `components/layout/AppShell.tsx`: replace `roleLabels` names (`'Sarah Johnson'`, `'Therese'`, `'Jessica Taylor'`) and `notifTeacherId = 'tch1'` with `useAuth().user`.
- Layout title maps — `ParentLayout.tsx` (`'Good afternoon, Sarah'`, `"Emma's classes"`, `"Emma's learning journey"`), `AdminLayout.tsx` (`'Good morning, Therese'`), `TeacherLayout.tsx` (`'Good morning, Jessica'`): make titles functions of the user's first name and the selected child, or use neutral titles.
- Delete `FAMILY_NAMES` in `PaymentsPage.tsx`, `BookAssessmentPage.tsx`, `AdminFamilyBookingPage.tsx`, `AdminParentsPage.tsx` (`FAMILY_NAMES`, `FAMILY_EMAILS`, `FAMILY_PHONES`). Add `parent_name`, `email`, `phone` to `Family` (type + mock + `getFamily`), and read from there.
- Replace `teacherId="tch1"` in `TeacherDashboardPage`, `TeacherAttendancePage`, `TeacherAssessmentsPage`, `TeacherReportsPage`, `TeacherStudentsPage`, `TeacherMessagesPage` with `useAuth().user.teacherId`. `AdminMyTeachingPage` default `useState('tch1')` → admin's own teacher id from auth.
- `TeacherDashboardPage` / `AdminMyTeachingPage` colour maps keyed by `tch1/tch2/tch3` → use `Teacher.color`.

### 2.3 Replace hard-coded page data with queries
- `DashboardPage.tsx`: remove the `enrichment` array. Derive from data: upcoming classes from `getBookings` + `getClassInstances`; session counts from bookings; tutor note from latest `StudentReport`/message; maths/english % from reports or hide the widgets until a data source exists. Remove the hard-coded `'Available in 12 days'`.
- `ChildProfilePage.tsx`: remove `enrichmentByChildId`; read child fields + reports + bookings. Persist goals (add `goals` collection or `Child.goals[]` + `updateChild`).
- `BookClassPage.tsx` & `AdminFamilyBookingPage.tsx`: remove `classes` / `CLASS_OPTIONS`; use `getClassInstances()` + `getTeachers()`.
- `AdminHomePage.tsx`: compute stats (students, active terms, pending payments, revenue this term, today's classes) from the "all" queries; remove hard-coded numbers.
- `TeacherClassesPage.tsx`: replace the local `useState` classes with data-layer CRUD (see 3.4).
- `AdminProgramsPage.tsx`, `AdminWaitingListsPage.tsx`, `AdminSettingsPage.tsx`: back with data-layer methods (programs = distinct subjects/class groupings, waiting list = see 3.3, settings = key/value store with `getSettings/updateSettings`).

**Exit check:** `grep -rnE "'f[1-4]'|'tch[1-3]'|Sarah|Therese|Jessica|FAMILY_NAMES|ALL_FAMILY_IDS|ALL_IDS" src` returns only mock seed data and the mock users file.

---

## Phase 3 — Business-rule alignment & missing features

### 3.1 🐞 Make the UI match the gating rule
In `BookClassPage.tsx` the `NO_TERM_EVER` banner says *"You can still book individual classes below at $50 each"*, but `useBookingEligibility` (correctly, per spec) blocks individual classes until a term has been bought.
- Change the banner copy to: individual classes unlock after the first term purchase; keep the "Purchase term" button.
- Force `bookingMode` away from `'individual'` when `NO_TERM_EVER` and disable that toggle button properly (currently it only gets a `disabled` class but still has an `onClick`).
- `AdminFamilyBookingPage.tsx` must use `useBookingEligibility`-equivalent logic (use `computeGatingState` on the selected family's terms) so admin booking obeys the same rule; today it re-implements pricing/rules locally.
- Remove the duplicated `TERM_SUBTOTAL/TERM_GST/TERM_TOTAL` constants in `PaymentsPage.tsx` and `AdminFamilyBookingPage.tsx`; export helpers `termPricing()` / `classPricing()` from `lib/config.ts` (or `lib/utils/pricing.ts`) returning `{ subtotal, gst, total }`. Use one rounding rule everywhere.
- Registration fee: add `REGISTRATION_FEE_EVERY_TERM = true` to config (`// TODO: confirm with client`) and honour it in `termPricing(familyHasPriorTerm)`.

### 3.2 ✨ Term-expiry reminders
- Pure helper already exists (`isTermExpiringSoon`). Add a mock "scheduler": on app load for a parent, if active term is expiring soon and no `term_expiring` notification exists for that term, `createNotification` + a system message (`is_reminder: true`).
- Keep the in-app banner in `TermCreditMeter` (exists).
- Production version = scheduled job (Phase 5.5).

### 3.3 ✨ Waiting list
- Add `WaitingListEntry { id, family_id, child_id, class_instance_id, created_at }` type and `joinWaitingList` / `getWaitingList` / `leaveWaitingList` to `DataClient`.
- `BookClassPage` "Join waiting list" button must call it (currently a no-op modal) and create a booking with `status:'waiting_list'` or an entry; show it in `BookingsPage`.
- `AdminWaitingListsPage` reads real entries; when a booking is cancelled and the class has a waiting list, notify the first family.

### 3.4 ✨ Teacher class management via data layer
- Add `createClassInstance`, `updateClassInstance`, `deleteClassInstance` (teacher-scoped) to `DataClient` + mock + stub.
- `TeacherClassesPage.tsx`: use them with `useMutation`; validate with zod (subject, day, time, capacity ≥ 1, price ≥ 0).
- Keep price **internal**: parent-facing screens must not render `ClassInstance.price` except in the individual-class purchase flow (`TEACHER_PRICE_IS_PARENT_FACING = false`). Where individual class price is shown to parents, decide with owner whether it is `INDIVIDUAL_CLASS_PRICE` (current) or `ClassInstance.price`.

### 3.5 ✨ Attendance persistence
- Add `Attendance { id, class_instance_id, child_id, date, status:'present'|'absent'|'late' }` + `getAttendance(classInstanceId, date)` / `saveAttendance(records[])`.
- `TeacherAttendancePage.tsx` saves via mutation; `ChildProfilePage` "Attendance" tab and parent dashboard "sessions attended" read from it.

### 3.6 ✨ Missing spec screens (confirm with owner which are still wanted)
Admin: Students, Assessments, Classes (+attendance modal), Attendance, Reports pages (spec §5 lists them; only Bookings/Payments/Tutors/Parents/Programs/WaitingLists/Settings/Messages exist). Teacher: Availability (stub with `// TODO: scope pending client confirmation`).

### 3.7 ✨ Parent ↔ teacher visibility rules
Ensure parents only see conversations/reports for their own family; teachers only see students booked into their classes (enforced by data-layer filters now, RLS later).

**Exit check:** all four demo families behave correctly on parent dashboard, book-class, payments, and admin family-booking; waiting list works end-to-end; attendance appears on the child profile.

---

## Phase 4 — Shared component layer (no visual change)

Extract, in this order, replacing usages as you touch files (verify pixel parity):
1. `components/ui/Modal.tsx` — replaces the repeated `.modal-backdrop > .modal > .modal-close` markup in BookClass, Payments, Bookings, FamilyBooking, Parents, etc.
2. `components/ui/Badge.tsx` — replaces `.table-status` + the 3 copies of `StatusBadge` (`PaymentsPage`, `AdminPaymentsPage`, others).
3. `components/ui/Card.tsx`, `components/ui/Stat.tsx` (duplicated in `AdminHomePage` and `AdminPaymentsPage`), `Avatar.tsx`.
4. `components/layout/ChildSwitcher.tsx` — duplicated in Dashboard and BookClass.
5. `components/domain/ClassCard.tsx`, `BookingCard.tsx`, `InvoiceLine.tsx`.
6. `lib/validation/*.ts` zod schemas + migrate Enrolment, Add-child, Signup, Payment-upload, Teacher class form to `react-hook-form`.
7. Move inline `style={{…}}` blobs in `PaymentsPage`, `AdminPaymentsPage`, `AppShell` into classes/Tailwind utilities.
8. Start migrating `index.css` sections to Tailwind utilities **page by page**; never do a big-bang rewrite.
9. Optionally switch touched files to the `@/` import alias.

---

## Phase 5 — Real backend (Supabase)

5.1 Create Supabase project; add `src/lib/supabase.ts` creating the client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Used **only** by `lib/data/supabase/*`.
5.2 Write SQL migrations for the tables in `architecture.md` §8 (including `profiles` with `role`, and money as integer cents or `numeric(10,2)`).
5.3 RLS policies: parent=own family; teacher=own classes/students/reports/conversations; admin=all. Add tests/queries proving a parent cannot read another family.
5.4 Implement every `DataClient` method in `supabase/client.ts` (split into per-domain files `families.ts`, `terms.ts`, `bookings.ts`, `payments.ts`, … and compose). Credit book/cancel + term activation as Postgres functions (RPC).
5.5 Storage bucket `payment-proofs` + signed URLs; implement `uploadPaymentProof`. Scheduled Edge Function / pg_cron for term-expiry notifications (replaces 3.2 mock scheduler).
5.6 Swap auth: Supabase Auth (email/password + password reset); `AuthContext` loads `profiles`; keep the `RequireRole` guards. Remove mock credentials and demo UI entirely.
5.7 Seed script that recreates the four demo families for staging.
5.8 Run the app with `VITE_DATA_SOURCE=supabase` and repeat all exit checks.

---

## Phase 6 — Production hardening

6.1 Tests: Vitest unit tests for `termUtils`, pricing helpers, cancellation rule; React Testing Library for `BookClassPage` in each gating state; one Playwright happy-path (signup → enrol → buy term → admin approves → book class).
6.2 Accessibility pass: focus trap + `Escape` for `Modal`, `aria-*` on drawer/tabs, label every input, contrast check on pastel badges.
6.3 Performance: route-level `React.lazy` code splitting for `/admin` and `/teacher`; check bundle size.
6.4 Observability: error boundary reporting (e.g. console → Sentry only if owner approves a new dependency).
6.5 Deployment config (hosting, env vars, SPA fallback rewrite for client-side routes), privacy/terms pages, real T&Cs text for enrolment step 4.
6.6 Final audit: re-run the `grep` check from Phase 2; confirm no demo code ships; update `memory.md`.

---

## Quick dependency map (what blocks what)

```
0 (hygiene) ──► 1 (data bugs) ──► 2 (no hard-coding, auth shape) ──► 3 (rules + features)
                                         │                                  │
                                         └──────────► 4 (components) ◄──────┘  (can overlap 3)
                                                              │
                                                              ▼
                                                     5 (Supabase) ──► 6 (hardening)
```
Phase 4 can be done opportunistically alongside 2–3. Phase 5 should not start until the `DataClient` contract has stopped changing (end of Phase 3).
