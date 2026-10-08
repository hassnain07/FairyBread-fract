# PRD — Fairybread & Fractions

> Product Requirements Document. Read this first. It says **what the product is, who it is for, and what must be built.**
> Companion files: `architecture.md` (how it is built), `rules.md` (what to use/avoid), `phases.md` (what to do, in order), `memory.md` (what exists today).

---

## 1. Product summary

**Fairybread & Fractions** is a web platform for a tutoring academy (Australian business: AUD currency, GST, `en-AU` locale, `.au` email domain). The business is growing from one solo tutor into an academy with hired teachers. The platform replaces phone/email/spreadsheet admin with one system for enrolment, class booking, payments, progress reporting and messaging.

It is **one codebase with four surfaces** sharing one data layer:

| # | Surface | Route prefix | Primary device | Who |
|---|---|---|---|---|
| 1 | Public marketing site | `/`, `/login`, `/signup` | Mobile + desktop | Prospective parents |
| 2 | Parent portal | `/parent/*` | **Mobile-first** (native-feeling responsive web) | Parents / guardians |
| 3 | Admin portal | `/admin/*` | **Desktop-first** | Business owner / staff ("Therese") |
| 4 | Teacher portal | `/teacher/*` | Desktop + tablet | Hired tutors |

Native iOS/Android apps are **out of scope**. The parent portal is responsive web only.

---

## 2. Target users and their goals

### Parent (primary user, highest volume)
- Add children, complete an enrolment form per child.
- Book a one-off **assessment** for a child.
- Buy a **term** (bank transfer + upload proof).
- Book classes using term credits, or buy individual classes.
- See bookings, cancel bookings (credit restored only if cancelled in time).
- Read end-of-term reports, message staff/teachers, receive notifications (incl. "term ending soon").

### Admin (business owner)
- See business health (stats, today's schedule).
- Verify or reject uploaded payment proofs (this activates terms).
- See/cancel all bookings; **book on behalf of families without portal access** ("Family booking").
- Manage tutors, parents/families, programs, waiting lists, settings.
- Message any family; can also act as a teacher ("My teaching").

### Teacher (new surface, as business scales)
- See own dashboard and classes; **set own class price and capacity**.
- See students in own classes, mark attendance.
- Schedule/track assessments, write end-of-term reports.
- Message parents and admin.

---

## 3. Commercial model (the core business rules)

This is a **family-level term-credit system**. It is *not* per-child, *not* per-subject, *not* a-la-carte.

### 3.1 Products

| Product | Who can buy | Price | Result |
|---|---|---|---|
| **Assessment** | Any family, any time, zero history needed | $50 + GST (assumed — unconfirmed) | One diagnostic session for one child |
| **Term** | Any family, any time (no assessment required) | **$500 + $30 registration = $530, + 10% GST = $583** (one bundled transaction) | A **10-week** term with a pool of **10 class credits** |
| **Individual class** | **Only families that have bought ≥1 term (any status, past or present)** | $50 + GST (assumed — unconfirmed) | One extra class outside the credit pool |

### 3.2 Gating state machine (single source of truth)

Derived from the family's term history and the **calendar** (never from a stored status flag):

| State | Definition | Assessment | Term purchase | Regular (credit) class | Individual class |
|---|---|---|---|---|---|
| `NO_TERM_EVER` | No term records | Yes | Yes | **No** | **No** |
| `ACTIVE_TERM` | Some term has `end_date` in the future | Yes | Yes (renew early) | Yes **only if `classes_remaining > 0`** | Yes |
| `TERM_EXPIRED` | Has terms, none active | Yes | Yes (renewal) | **No** | Yes |

Canonical implementation: `src/lib/utils/termUtils.ts → computeGatingState()`. Consumed via `useTermStatus` → `useBookingEligibility`. **No other file may re-implement this logic.**

### 3.3 Credit mechanics
- Credits are **family-level**: one pool shared by all children and subjects. The child is chosen at booking time.
- The clock is the **10-week calendar**, not credit usage. Term ends at week 10 regardless of unused credits.
- **No rollover.** Unused credits expire.
- Booking any class by credit decrements the pool by exactly 1 (regardless of teacher/subject/price).
- **Cancellation:** ≥24 hours before the session → credit restored. Later → credit **not** restored. (UI copy already says this; logic does not yet enforce it — see `phases.md`.)
- **Expiry warning:** notify parents 1–2 weeks before term end (in-app banner + notification + message). `TERM_EXPIRY_WARNING_WEEKS = 2`.

### 3.4 Payments
- **Manual only**: parent pays by bank transfer → uploads proof → admin approves/rejects. **No payment gateway** in this scope.
- Approving a `term` payment creates/activates a term (10 credits, 10 weeks).
- Statuses: `pending → paid | rejected` (`failed` also exists in the type).

### 3.5 Open questions (must stay configurable, each marked `// TODO: confirm with client`)
1. Individual class price (assumed $50 = $500 ÷ 10).
2. Assessment price (assumed same $50).
3. Is the $30 registration fee charged every term or first signup only? (assumed: every term).
4. Does teacher-set class price ever affect what a parent pays? (assumed: internal/payroll only, except individual-class purchases).
5. Do teacher price changes need admin approval?
6. Can teachers manage their own availability, or does admin control the timetable?
7. Full scope of teacher messaging permissions.
8. Is GST charged on top (as built) — the original spec did not mention GST; confirm.

**Rule:** never hard-code these values. They live in `src/lib/config.ts`.

---

## 4. Functional requirements by surface

Legend: **Built** = UI exists and works against mock data · **Partial** = UI exists but has a known gap · **Missing** = not built.

### 4.1 Public / auth
| Feature | Status |
|---|---|
| Landing page (hero, how-it-works, features, CTA) | Built (static) |
| Login (email+password, role redirect) | Partial — mock credentials only, no real auth |
| Signup (2-step, creates family) | Partial — mock; assigns every new user family `f4` |
| Forgot password (`/forgot-password`) | **Missing** (link exists, no route) |
| Route protection by role | **Missing** |

### 4.2 Parent portal
| Feature | Route | Status |
|---|---|---|
| Dashboard (child switcher, term credit meter, quick actions, upcoming classes) | `/parent` | Partial — much of the per-child stats is hard-coded |
| My children (list, add child) | `/parent/children` | Built |
| Child profile (tabs: overview/goals/attendance/sessions/notes) | `/parent/children/:childId` | Partial — hard-coded enrichment, goals not saved |
| Book assessment (child → date/slot → payment → proof upload → confirm) | `/parent/book-assessment` | Partial — payment stored as `individual_class` type |
| Enrolment (6 steps incl. T&Cs + signature) | `/parent/enrol` | Partial — **bug: creates a duplicate child instead of updating** |
| Book a class (gated; credit vs individual) | `/parent/book-class` | Partial — **credit booking is not persisted**; class list hard-coded |
| My bookings (+cancel) | `/parent/bookings` | Partial — cancel always restores credit |
| Payments (term purchase, individual class payment, proof upload, history) | `/parent/payments` | Built (mock) |
| Reports (per child) | `/parent/reports[/:childId]` | Built (reads teacher-written reports) |
| Messages (inbox + thread) | `/parent/messages` | Built (mock) |
| Notifications drawer | header bell | Built — notifications are static seed data; nothing creates them |

### 4.3 Admin portal
| Feature | Route | Status |
|---|---|---|
| Dashboard | `/admin` | Partial — fully hard-coded numbers |
| Bookings (all families, cancel) | `/admin/bookings` | Partial — loops over hard-coded family IDs |
| Family booking (4-step: pick family → action → book/purchase → done) | `/admin/family-booking` | Built (mock) — hard-coded class list/family names |
| My teaching (admin acts as teacher) | `/admin/my-teaching` | Built (mock) |
| Payments (verify/reject, stats, all payments) | `/admin/payments` | Built (mock) — hard-coded family IDs |
| Messages | `/admin/messages` | Built (mock) |
| Tutors | `/admin/tutors` | Built (read-only) |
| Parents (+detail modal) | `/admin/parents` | Partial — names/emails/phones hard-coded maps |
| Programs / Waiting lists / Settings | `/admin/programs`, `/waiting-lists`, `/settings` | Partial — static UI, no data layer |

### 4.4 Teacher portal
| Feature | Route | Status |
|---|---|---|
| Dashboard | `/teacher` | Partial — hard-coded teacher `tch1` |
| My classes (add/edit, set price & capacity) | `/teacher/classes` | Partial — **local state only, not in data layer** |
| My students | `/teacher/students` | Built (mock), hard-coded teacher/families |
| Attendance | `/teacher/attendance` | Partial — **not persisted** (no attendance API exists) |
| Assessments | `/teacher/assessments` | Built (mock) |
| Reports (write end-of-term) | `/teacher/reports` | Built (mock) |
| Messages | `/teacher/messages` | Built (mock); scope pending client |
| Availability | — | **Missing** (stub per spec; scope unconfirmed) |

### 4.5 Cross-cutting
- Notifications: bell + drawer + mark-read **Built**; event-driven creation (booking, payment approval, term expiring, report ready) **Missing**.
- Messaging: conversations between parent↔admin, parent↔teacher, teacher↔admin **Built (mock)**.
- Waiting list: "Join waiting list" modal **exists but does nothing**; `waiting_list` booking status exists in types but is never created.

---

## 5. Non-functional requirements
- **Visual identity is fixed.** Playful, warm pastel palette (pink/teal/yellow/orange/green), DM Sans body, Fraunces italic serif accents. Do not redesign. Tokens are in `tailwind.config.js` and `:root` CSS variables in `src/index.css`.
- **Responsive**: real breakpoints at 1050px / 780px / 480px must be preserved.
- **Data portability**: swapping mock → Supabase must be a config change (`VITE_DATA_SOURCE`) plus implementing one file, not a UI rewrite.
- **Accessibility**: keyboard-reachable modals/buttons, labelled inputs, sufficient contrast (not yet audited).
- **Security (once real backend exists)**: role-based access enforced server-side (Supabase RLS), never only in the UI.

## 6. Explicit non-goals (this phase)
- Payment gateway / card payments.
- Native mobile apps.
- The internal "Proposal" sales page (deliberately removed; leftover CSS only).
- Resolving the open pricing questions in §3.5 by guessing — keep them configurable.

## 7. Success criteria
1. All three gating states behave exactly as §3.2 in every booking surface (parent and admin family-booking).
2. A credit booking persists, shows in My bookings, and decrements the credit meter everywhere.
3. A parent can go from signup → enrol child → buy term → admin approves → parent books class, with no hard-coded identity or data anywhere in the path.
4. Admin, parent and teacher views of the same booking/payment/child stay consistent (single data layer, correct query invalidation).
5. Switching `VITE_DATA_SOURCE=supabase` runs the whole app on a real backend.
