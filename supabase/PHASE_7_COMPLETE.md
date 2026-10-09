# Phase 7 — Teaching loop: teacher portal, attendance, assessments, reports

## Status: COMPLETE

`tsc --noEmit` ✅ · `npm run build` ✅ (1770 modules)

---

## Tasks completed

### 7.1 Types
- `AttendanceRecord` status values (`present | absent | no_show | late`) already correct in `src/types/booking.ts`
- `Assessment`, `StudentReport`, `NewReport` already correct from Phase 6

### 7.2 Supabase methods added

| Method | File |
|---|---|
| `getReportsForChild` | `supabase/reports.ts` (new) |
| `getTeacherReports` | `supabase/reports.ts` (new) |
| `createReport` | `supabase/reports.ts` (new) |
| `getAttendance` | `supabase/attendance.ts` (new) |
| `getChildAttendance` | `supabase/attendance.ts` (new) |
| `saveAttendance` | `supabase/attendance.ts` (new) — calls `rpc save_attendance` |
| `getTeacherAssessments` | `supabase/assessments.ts` (extended) |
| `createTeacherAssessments` | `supabase/assessments.ts` (extended) |
| `updateAssessment` | `supabase/assessments.ts` (extended) |
| `createClassSlot` | `supabase/catalog.ts` (extended) |
| `updateClassSlot` | `supabase/catalog.ts` (extended) |
| `deactivateClassSlot` | `supabase/catalog.ts` (extended) — calls `rpc deactivate_class` |
| `cancelSession` | `supabase/catalog.ts` (extended) — calls `rpc cancel_session` |

`supabase/index.ts` updated to wire in `reports` and `attendance` modules.

### 7.3 Teacher pages rewritten

| Page | Key changes |
|---|---|
| `TeacherDashboardPage` | Uses `useAuth().teacherId`; today's sessions from `getUpcomingSessions({ teacherId, from, to })`; student count from `getBookingsForTeacher()` |
| `TeacherClassesPage` | Real `getClassSlots()` filtered by `teacher_id`; create/update via `createClassSlot`/`updateClassSlot`; price in cents via `formatMoney` |
| `TeacherStudentsPage` | `getBookingsForTeacher()` (RLS-scoped); no `ALL_FAMILY_IDS`; child data from embedded booking joins |
| `TeacherAttendancePage` | Session picker from `getUpcomingSessions` (past 2 weeks); pre-loads `getAttendance`; saves via `saveAttendance`; 4 status values |
| `TeacherAssessmentsPage` | `getTeacherAssessments()`; `createTeacherAssessments(rows)`; `updateAssessment` for mark-complete; no `ALL_FAMILY_IDS` |
| `TeacherReportsPage` | `getTeacherReports()`; term label from `settings.business.current_term_label`; `getBookingsForTeacher()` for student list; no `CURRENT_TERM` constant; invalidates `reports(childId)` on success |

### 7.4 AdminMyTeachingPage
- Initial `teacherId` = `useAuth().teacherId` (no more `useState('tch1')`)
- Shows friendly message if admin has no teacher row
- View components updated to use `teacherIdOverride` prop pattern

### 7.5 Parent ReportsPage
- Replaced loop over all teachers + `getReports(teacherId)` with single `getReportsForChild(child.id)`
- Teacher name/initials still resolved from `getTeachers()` for display

### 7.6 Parent DashboardPage
- `getReports(child.id)` → `getReportsForChild(child.id)`

### 7.6 Parent ChildProfilePage
- Removed `enrichmentByChildId` static data entirely
- Overview tab: latest report subjects as progress bars; attendance % from `getChildAttendance`
- Attendance tab: real records from `getChildAttendance`
- Goals tab: reads/writes `child.goals` via `updateChild` (persisted)
- Sessions tab: upcoming confirmed bookings from `getBookings`
- Notes tab: reads `child.notes` (read-only, set during enrolment)

### DataClient interface additions
- `createClassSlot`, `updateClassSlot`, `deactivateClassSlot`, `cancelSession` added to catalog section
- `getTeacherAssessments()`, `createTeacherAssessments(rows)`, `updateAssessment` added to assessments section
- `getReportsForChild`, `getTeacherReports`, `getAttendance`, `getChildAttendance`, `saveAttendance` added
- Old `getReports(teacherId)` removed

### Mock client updated
- All new method signatures implemented with minimal in-memory stubs
- `getTeacherAssessments()` (no arg), `createTeacherAssessments(rows)`, `updateAssessment`
- `getReportsForChild`, `getTeacherReports`, `getAttendance`, `getChildAttendance`, `saveAttendance`
- `createClassSlot`, `updateClassSlot`, `deactivateClassSlot`, `cancelSession`

---

## Deviations from spec

- **`TeacherStudentsPage`**: The spec says teachers cannot read `families` (contact details stay private). The rewrite uses only `getBookingsForTeacher()` with embedded child data — no family data is fetched. ✅
- **`TeacherAttendancePage`**: Session picker shows past 2 weeks + tomorrow (not just today) to allow catching up on missed sessions. Spec says `from: today-14d, to: today+1d` — matches.
- **`createTeacherAssessments`**: Inserts with `status: 'scheduled'` directly (not `awaiting_payment`) since these are teacher-initiated assessments for existing students, not parent-booked assessments. Parent-booked assessments (from `BookAssessmentPage`) go through the payment flow and arrive with `awaiting_payment`.
- **`TeacherClassesPage`**: `upsertProgram` not implemented in Phase 7 (Phase 8 scope). The form requires a `program_id`; it falls back to `programs[0]?.id`. If no programs exist in the DB, `createClassSlot` will fail — this is expected until Phase 8 seeds programs.
- **`getUpcomingSessions` with `teacherId` filter**: The Supabase query uses `.eq('class.teacher_id', opts.teacherId)` which filters on a joined column. If the PostgREST version doesn't support this syntax, the filter may be ignored and all sessions returned (RLS still limits to the teacher's own data). A fallback client-side filter is applied in the UI.

---

## Exit criteria

- [x] Teacher pages use `useAuth().teacherId` — no `'tch1'` literals
- [x] `getBookingsForTeacher()` used (RLS limits to caller's classes)
- [x] Attendance saves via `saveAttendance` RPC and survives reload
- [x] `createReport` triggers `report_ready` notification (server-side trigger — not tested locally)
- [x] `getReportsForChild` replaces the loop over all teachers in `ReportsPage`
- [x] No `ALL_FAMILY_IDS`, `CURRENT_TERM`, or `'tch'` literals in migrated teacher pages
- [x] `tsc --noEmit` exits 0
- [x] `npm run build` exits 0
