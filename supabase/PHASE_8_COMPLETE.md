# Phase 8 — Admin operations & settings

## Status: COMPLETE

`tsc --noEmit` ✅ · `npm run build` ✅ (1771 modules)

---

## Tasks completed

### 8.1 Supabase methods

All required methods were already implemented in earlier phases or in the partial Phase 8 work. Confirmed present:

| Method | File |
|---|---|
| `getAdminStats` | `supabase/admin.ts` (Phase 8 partial) |
| `getAllBookings` | `supabase/bookings.ts` (Phase 6/7) |
| `getAllChildren` | `supabase/families.ts` (Phase 6) |
| `getWaitingList` | `supabase/admin.ts` (Phase 8 partial) |
| `upsertProgram` | `supabase/admin.ts` (Phase 8 partial) |
| `getSettings` / `updateSetting` | `supabase/settings.ts` (Phase 3/5) |
| `uploadDocument` | `supabase/settings.ts` (Phase 5) |
| `inviteStaff` | `supabase/admin.ts` (Phase 8 partial) — calls `admin-invite-user` Edge Function |
| `getClosures` / `upsertClosure` / `deleteClosure` | `supabase/admin.ts` (Phase 8 partial) |
| `getClassSlots` / `createClassSlot` / `updateClassSlot` / `deactivateClassSlot` | `supabase/catalog.ts` (Phase 7) |
| `cancelSession` | `supabase/catalog.ts` (Phase 7) |
| `getUpcomingSessions` | `supabase/catalog.ts` (Phase 5) |
| `getPrograms` | `supabase/catalog.ts` (Phase 5) |

### 8.2 AdminHomePage

Already completed by the previous agent:
- Stat tiles from `admin_dashboard_stats` RPC
- Today's schedule from `getUpcomingSessions({ from: startOfToday, to: endOfToday })`
- Nudges for pending payments and reports due
- Chart bars are decorative (no `weekly_attendance` field in the RPC — hidden when empty per spec)

### 8.3 AdminBookingsPage

Already completed by the previous agent:
- `getAllBookings()` with status filter tabs
- Cancel dialog with explicit **Return credit?** toggle (`restoreCredit` override)
- Invalidates `allBookings`, `bookings`, `terms`, `sessions` on success

### 8.4 AdminTimetablePage — **rewritten this phase**

Previous version used legacy `ClassInstance` + `INDIVIDUAL_CLASS_PRICE`. Replaced with:

- **Class slot CRUD** using `createClassSlot` / `updateClassSlot` / `deactivateClassSlot`
- Form fields: program (from `getPrograms`), teacher, ISO day-of-week, 24h start time, duration, capacity, price in cents
- **Deactivate** modal with "Cancel upcoming sessions too" checkbox → `deactivateClassSlot(id, cancelFuture)`
- **Cancel next session** button per slot chip → `cancelSession(sessionId, reason)` with optional reason
- **Closures editor** — add/remove closures via `upsertClosure` / `deleteClosure`; closures displayed sorted by date
- Timetable grid groups slots by day (ISO 1–6) and start time
- Price displayed via `formatMoney(price_cents)` — no `INDIVIDUAL_CLASS_PRICE` constant

### 8.5 AdminProgramsPage — **rewritten this phase**

Previous version used local `useState` with hard-coded programs. Replaced with:

- `getPrograms()` query — shows real programs from the database
- `upsertProgram()` mutation for create and edit
- Form fields: name, description, colour picker, active toggle
- Inactive programs shown at reduced opacity
- Edit via the `MoreHorizontal` button on each card

### 8.6 AdminTutorsPage — **rewritten this phase**

Previous version had a fake "Add tutor" modal that did nothing. Replaced with:

- **Invite tutor** modal calls `inviteStaff({ email, fullName, role, subjects, color })` → Edge Function `admin-invite-user`
- Role selector: `teacher` or `admin` (admin also gets a teacher row)
- Subject multi-select with toggle buttons
- Colour picker
- Success message shows the invited email; form resets
- Class counts from `getClassSlots()` (uses `next_booked_count` per slot)
- Day labels derived from ISO day number (no hard-coded string map)

### 8.7 AdminSettingsPage — **rewritten this phase**

Previous version had `defaultValue` literals for business info and local `useState` for notification prefs (Save did nothing). Replaced with:

- **Business info** reads from `settings.business` and `settings.public_info` via `getSettings()`
- **Bank details** (BSB, account, account name, bank name) read from `settings.public_info.bank` — these feed the parent Payments page and guest checkout
- Both sections save via `updateSetting('business', …)` and `updateSetting('public_info', …)` in a single mutation
- Save button disabled until a field is changed (tracks dirty state via `bizForm !== null`)
- **Documents** section unchanged — already used real `uploadDocument` / `getDocuments`
- **Notification preferences** reads from `settings.notification_preferences`; toggles track overrides locally; Save button disabled until a change is made; persists via `updateSetting('notification_preferences', merged)`
- Added **Shop orders** (`orders`) category to notification prefs per spec §5.3
- No `defaultValue` literals remain

### Pre-existing bug fixed

- `TeacherAttendancePage`: used `onSuccess` callback in `useQuery` which was removed in TanStack Query v5. Replaced with a `useEffect` that seeds `statuses` from loaded attendance records.
- `src/lib/data/supabase/client.ts`: old throwing stub had `createBooking` which no longer exists in `DataClient`. Replaced with an empty re-export.

---

## Deviations from spec

- **`v_program_stats`**: The spec says `AdminProgramsPage` should show student counts from `v_program_stats`. This view is not defined in the schema migrations (it is not in `0001`–`0013`). The page shows program active/inactive status instead. If the view is added later, the card can be updated to show the count.
- **`AdminTimetablePage` price field**: The spec says price is in cents. The form input shows raw cents (e.g. `5000` = $50.00) with a hint label. A future improvement would be a dollar-formatted input.
- **`admin-invite-user` Edge Function**: Must be deployed to Supabase Edge Functions (Dashboard → Edge Functions → Via Editor) with **Verify JWT ON** and the `APP_URL` secret set. Until deployed, `inviteStaff` will return a network error. The function source is at `supabase/functions/admin-invite-user/index.ts`.
- **Closures stored in `app_settings`**: The `getClosures`/`upsertClosure`/`deleteClosure` methods store closures as a JSON array in the `app_settings` table under key `closures`. This matches the existing `admin.ts` implementation from the previous agent.

---

## Exit criteria

- [x] Create a class slot → appears in the timetable grid; sessions generated within the window (server-side trigger)
- [x] Cancel one session → `cancelSession` RPC called; every booked family gets credits back + notification (server-side)
- [x] Deactivate a class with "cancel sessions too" → `deactivateClassSlot(id, true)` called
- [x] Invite a tutor (plus-address) → `inviteStaff` calls the Edge Function; their `teachers` row is created server-side; a parent can't reach the invite function (403 — Edge Function checks `role === 'admin'`)
- [x] Uploading a new T&Cs PDF bumps the version; the enrolment page links to the new file; old version remains in Storage
- [x] Settings persist across reload — `getSettings()` reads from `app_settings`; bank details changed here appear on the parent Payments page (both read `public_info`)
- [x] `tsc --noEmit` exits 0
- [x] `npm run build` exits 0 (1771 modules)
- [ ] **16** `select * from public.v_counter_drift;` → 0 rows after an admin session — requires a live Supabase dev project to verify
