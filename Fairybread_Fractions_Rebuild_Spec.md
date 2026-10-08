# Fairybread & Fractions — Frontend Rebuild Specification
**For: AI coding agent (Google AI Studio / Claude Code / similar)**
**Source: audited Bolt prototype (`project-bolt-sb1-ng3zeq3a.zip`) — single 1,543-line `App.tsx`, no routing, no real data layer, inline mock state throughout**
**Goal: rebuild the same product, pixel-accurate to the prototype, as a properly structured, scalable React codebase**

---

## 0. Read this first — rules for the agent

1. **Do not invent new visual design.** Every color, spacing value, font, and component style below was extracted directly from the existing prototype's `index.css` and `App.tsx`. Preserve it exactly. This is a restructuring job, not a redesign.
2. **Do not lose any screen or flow.** Section 5 is a complete inventory of every screen in the current prototype. Every one of them must exist in the rebuild.
3. **Do implement the new business rules in Section 6.** These are real client requirements gathered after the prototype was built, and are *not* reflected in the current demo code. This is the main functional gap this rebuild must close.
4. **Build in the phased order in Section 9.** Don't attempt the whole app in one pass.
5. Where this document says "mock," it means: build the UI and the data-fetching interface fully, but back it with static/local data for now, behind an abstraction that can later be swapped for a real API (Supabase is already a project dependency — assume that's the eventual backend, but don't hard-wire Supabase calls throughout the app; isolate them).

---

## 1. What this product is

A tutoring academy platform (Fairybread & Fractions) with three parent-facing... actually **four** user-facing surfaces sharing one backend:

1. **Public marketing site** — brochure pages, drives enrolment.
2. **Parent app/portal** — mobile-first, native-feeling responsive web (and eventually iOS/Android). Parents manage children, book assessments/classes, pay, track progress, message staff.
3. **Admin portal** — desktop-first. Staff run the whole business: students, tutors, classes, bookings, payments, reports.
4. **Teacher portal** — **new surface, not in the current prototype.** As the business grows from a solo tutor to an academy with hired teachers, each teacher needs their own interface to manage their classes, set their own class pricing, view their assigned students, mark attendance, and manage their availability.

Payments are **manual**: bank transfer → parent uploads proof → admin approves/rejects. No payment gateway in this phase.

---

## 2. The commercial model (this is the part the current prototype gets wrong/missing — build it correctly)

This is a **family-level term-credit system**, not per-child, not per-subject, not a-la-carte class booking.

### 2.1 The three purchasable products, in strict access order

| Product | Who can buy it, and when | What it unlocks |
|---|---|---|
| **Assessment** | Any family, any time — even with zero purchase history | A single diagnostic session. This is the only thing a brand-new family can buy first. |
| **Term** | Any family, any time (does not require an assessment first) | A **10-week term**: **$500 flat + $30 registration fee**, paid as one bundled transaction. Grants the family a pool of **10 class credits**. |
| **Individual/extra class** | **Locked until the family has purchased at least one Term** (current or past) | One additional class booking outside the term pool, for families who've used their 10 credits or want an extra one-off. |

**Gating logic — implement as an explicit state machine, not ad-hoc conditionals:**

- `NO_TERM_EVER` → Assessment: ✅ allowed. Term purchase: ✅ allowed (first purchase). Regular class booking: ❌ blocked. Individual class: ❌ blocked.
- `ACTIVE_TERM` (term purchased, within its 10-week window, credits may be >0 or =0) → Assessment: ✅. Regular class booking: ✅ **only while `classes_remaining > 0`**. Individual class: ✅ allowed (family has purchased a term before).
- `TERM_EXPIRED` (10-week window elapsed, regardless of leftover unused credits) → Assessment: ✅. Regular class booking against the old term: ❌ blocked — must renew. Individual class: ✅ still allowed (they've purchased a term historically). New Term purchase: ✅ (renewal).

### 2.2 Term/credit mechanics

- **Family-level, not per-child, not per-subject.** One family = one shared pool of 10 credits across however many children and subjects they use. A parent picks which child a booking is for at the time of booking — the credit itself is child-agnostic and subject-agnostic.
- **Fixed 10-week calendar clock**, not a credit-based clock. The term ends at week 10 regardless of how many of the 10 credits were actually used.
- **No rollover.** Unused credits at week 10 simply expire — no compensation, no carry-forward.
- **Expiry warning**: parents must be notified **1–2 weeks before** their term's 10-week window ends, prompting them to book remaining credits and/or renew. This should be a scheduled notification/reminder, surfaced both in-app (banner/notification) and via the messaging/notification system (FR-MSG-02 in the original SRS).
- Booking a class (regardless of subject/teacher/child) decrements `classes_remaining` by 1. Cancelling within the allowed window (see original SRS FR-CB-03) restores 1 credit to the pool. Late cancellation does not restore it (FR-CB-04).

### 2.3 Data model additions required

```
Family
  id
  parent_id (owner/primary account holder)
  children: Child[]

Term
  id
  family_id
  status: 'active' | 'expired' | 'pending_payment'
  start_date
  end_date              // start_date + 10 weeks, computed or stored
  classes_included: 10  // constant for now, but store it, don't hardcode 10 in UI logic
  classes_booked: number
  classes_remaining: number   // derived, but fine to store for query simplicity
  payment: Payment (linked — the $500 + $30 bundled transaction)

IndividualClassPurchase
  id
  family_id
  class_booking_id
  payment: Payment
  // only creatable if family has >= 1 Term record (any status)

Assessment
  id
  family_id
  child_id
  payment: Payment
  // creatable with zero Family purchase history

ClassBooking
  id
  family_id
  child_id           // which child this specific booking is for
  class_instance_id  // links to the timetable/class + teacher
  source: 'term_credit' | 'individual_purchase'
  status: 'confirmed' | 'waiting_list' | 'cancelled'
  credit_consumed: boolean

Teacher
  id
  name
  subjects: string[]
  classes: ClassInstance[]
  // pricing set by teacher — see note below

ClassInstance
  id
  teacher_id
  subject
  day_of_week / date
  time
  capacity
  price   // set by teacher — TREAT AS INTERNAL/ADMIN-FACING DATA FOR NOW.
          // Do not surface this price to parents during term-credit booking flows
          // (booking a class always costs exactly 1 credit, regardless of which
          // teacher/class chosen). Only surface price to admin/teacher views, and
          // to the Individual Class purchase flow, until the client confirms
          // otherwise. Flag this assumption visibly in code comments.
```

> **Open items the client hasn't confirmed yet — build these as configurable, not hardcoded, so they're a one-line change later, and leave a `// TODO: confirm with client` comment at each:**
> - Individual class price (currently assumed $50, i.e. $500 ÷ 10 — unconfirmed)
> - Whether the $30 registration fee is charged on every term renewal or first signup only (currently assumed: every term)
> - Whether teacher-set class price ever affects what a parent pays, or is purely internal/payroll data (currently assumed: internal only, except for individual class purchases)

---

## 3. Recommended tech stack

Keep what's already in the prototype's `package.json` as the base, add structure:

- **React 18 + TypeScript + Vite** (unchanged)
- **React Router v6** — replaces the current `useState`-based `area` / `parentPage` / `adminPage` view-switching. Every screen gets a real URL.
- **Tailwind CSS** — already installed but barely used (the prototype is 95% hand-written CSS classes in `index.css`). Port the existing design tokens into `tailwind.config.js` `theme.extend` (see Section 4) so new components are built with Tailwind utilities against the *same* palette, instead of continuing to hand-write global CSS.
- **TanStack Query (`@tanstack/react-query`)** — for all data fetching, caching, and mutations, sitting on top of the data-access layer described in Section 8. Even while data is mocked, wrap it in query hooks so swapping to Supabase later touches only the data layer, not components.
- **Zustand** (or React Context if you want zero new deps) — for small pieces of genuinely global client state only: current logged-in user/role, selected child, sidebar/menu open state. Do **not** use it for server data (that's React Query's job).
- **Supabase JS client** (`@supabase/supabase-js`, already a dependency) — set up the client and auth scaffolding, but keep all actual calls behind the data-access layer (Section 8), not scattered through components.
- **lucide-react** — keep, already used throughout for icons.
- **Zod** — recommended addition for validating form input (enrolment, add-child, add-class forms etc.) and for typing API responses at the boundary.
- **React Hook Form** — recommended for the multi-step forms (Enrolment, Assessment booking, Payment upload) instead of the current raw `useState` per field.

---

## 4. Design tokens — port exactly, do not modify

Extracted from the prototype's `:root` CSS variables. Add these to `tailwind.config.js`:

```js
// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#23312f',
        muted: '#75817d',
        line: '#e9eeea',
        paper: '#fffdf9',
        pink: { DEFAULT: '#e85a91', soft: '#fff0f5' },
        yellow: { DEFAULT: '#f6ca42', soft: '#fff8df' },
        teal: { DEFAULT: '#44b7bd', soft: '#e9f8f6' },
        orange: { DEFAULT: '#f48a50', soft: '#fff0e9' },
        green: { DEFAULT: '#5ab77f', soft: '#edf9ef' },
        magenta: '#c9489a',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],       // body/UI font
        serif: ['Fraunces', 'serif'],           // display/quote/italic-accent font — used for hero headline emphasis, tutor quotes, signature input
      },
      boxShadow: {
        card: '0 16px 40px rgba(36,55,49,.08)',
      },
      borderRadius: {
        card: '16px',
        pill: '999px',
      },
    },
  },
  plugins: [],
};
```

**Status/semantic colors** (used for badges — Confirmed/Pending/Present/Absent etc.), also port as tokens rather than repeating hex values inline:
- Success/confirmed: bg `#e9f8ef` / `#eaf8ee`, text `#3a9c68` / `#36a269`
- Pending/warning: bg `#fff3d6` / `#fff8df`, text `#c9941e` / `#ad8917`
- Error/review/failed: bg `#fff0e9`, text `#d86b35`
- "View/manage" link-style badge: bg pink-soft, text pink

**Typography rule preserved from prototype**: headline emphasis and pull-quotes use `Fraunces` serif, italic, in pink — e.g. the hero's "*goes a long way*", tutor recommendation quotes, the enrolment signature input. Everything else is `DM Sans`.

**Layout constants**: sidebar width `252px`, app header height `116px` (mobile: auto/min `100px`), card border-radius `16-18px`, page max-width `1500px` main content, narrow flows (assessment/enrolment) max-width `~780-1050px`.

---

## 5. Complete screen inventory (from audited prototype → target file structure)

Every one of these exists today as a function inside `App.tsx`. Each must become its own file/route in the rebuild.

### Public site
- `Landing` → `/` — marketing homepage (hero, how-it-works steps, feature grid, CTA)
- `Proposal` → internal-only page, **exclude from the real product build** (it's a sales/demo artifact, not a product screen — confirm with the org before porting, but default to leaving it out)

### Parent app (`/parent/*`)
- `ParentHome` → `/parent` (dashboard/overview — child switcher, welcome/hero card, progress ring, quick actions)
- `Children` → `/parent/children` (list of kids + add-child)
- `Profile` (child detail) → `/parent/children/:childId` — tabs: overview / goals / attendance / sessions / notes
- `Assessment` (booking flow) → `/parent/book-assessment` — multi-step: select child → calendar/slot → payment → confirmation
- `Enrolment` → `/parent/enrol` — multi-step: Parent Details → Child Details → Learning Info → T&Cs → Signature → Complete
- `Classes` (book a class) → `/parent/book-class` — must implement the term-credit gating from Section 2.1
- `Bookings` (My bookings) → `/parent/bookings`
- `Reports` → `/parent/reports/:childId` — end-of-term report, star ratings, tutor recommendation quote
- `Messages` → `/parent/messages` — inbox list + thread view
- `Payments` → `/parent/payments` — current term status, invoice, payment history, upload-proof flow
- `Modal` types used across parent flows (`payment`, `success`, `cancel`, `waiting`, `report`, `classConfirm`) → these become shared `<Dialog>`/`<Modal>` components, not one giant switch — see Section 7.

### Admin portal (`/admin/*`, desktop-first)
- `AdminHome` → `/admin` (stats cards, chart, today's schedule, nudges/quote panel)
- `AdminStudents` → `/admin/students`
- `AdminAssessments` → `/admin/assessments`
- `AdminClasses` (+ attendance-taking modal) → `/admin/classes`
- `AdminBookings` → `/admin/bookings`
- `AdminAttendance` → `/admin/attendance`
- `AdminPayments` (+ review/approve modal) → `/admin/payments`
- `AdminReports` (+ generate-report modal) → `/admin/reports`
- `AdminTutors` → `/admin/tutors` — **extend this to also manage Teacher accounts/permissions per Section 6**
- `AdminParents` (+ parent detail modal) → `/admin/parents`
- `AdminPrograms` → `/admin/programs`
- `AdminWaitingLists` → `/admin/waiting-lists`
- `AdminSettings` → `/admin/settings`
- `AdminMessages` → `/admin/messages`

### Teacher portal (`/teacher/*`) — **new, not in current prototype, build per Section 6**
- `/teacher` — dashboard: today's/upcoming classes, quick stats
- `/teacher/classes` — manage own classes: timetable, capacity, **set own class price**
- `/teacher/students` — students assigned across their classes
- `/teacher/attendance` — mark attendance for their own sessions
- `/teacher/availability` — set availability/schedule
- `/teacher/messages` — message parents/admin (read + reply, per original SRS Tutor role, now extended)

---

## 6. Teacher portal — scope note

This surface did not exist in the original SRS (`Tutor` was defined as "Web portal / mobile (read-mostly)") or in the audited prototype. The client has since confirmed teachers need write access to manage their own classes and set pricing, as part of scaling from solo tutor to academy.

**Build it as its own top-level route group and role (`role: 'teacher'`), reusing the shared component library (Section 7), but do not assume its full scope yet.** Confirmed so far: teachers manage classes, set price, have their own interface. Not yet confirmed: whether teacher price changes require admin approval, whether teachers can manage their own availability independently or admin controls the timetable, and the full extent of messaging permissions. Build the dashboard, class management, and attendance screens now (these are well-defined); stub availability and messaging with clear `// TODO: scope pending client confirmation` markers.

---

## 7. Component architecture

Replace the prototype's dozens of local one-off functions with a proper shared UI layer. Every primitive used more than once in the prototype (`Button`, `Stat`, `Progress`, `ChildSwitcher`, table, badges, modal shell, etc.) becomes a real reusable component.

```
src/
  app/                         # app bootstrap, providers, router
    App.tsx
    router.tsx                 # React Router route tree, one entry per screen in Section 5
    providers.tsx              # React Query client, auth context, theme

  components/
    ui/                        # generic, brand-styled primitives — no business logic
      Button.tsx
      Card.tsx
      Badge.tsx                # status pills: confirmed/pending/present/absent etc.
      Progress.tsx             # linear progress bar
      ProgressRing.tsx         # circular ring (used on parent dashboard)
      StarRating.tsx
      Modal.tsx                # generic dialog shell (replaces the one big `Modal` switch)
      Table.tsx
      Toggle.tsx
      Avatar.tsx                # initials-circle, used everywhere (child, tutor, parent)
      Sprinkles.tsx / Confetti.tsx   # decorative elements from hero/landing
    layout/
      AppShell.tsx              # sidebar + header shell, parameterised by role (parent/admin/teacher)
      Sidebar.tsx
      Header.tsx                # breadcrumb + title + bell + avatar
      ChildSwitcher.tsx
    domain/                     # business-specific composite components, still presentational
      ChildCard.tsx
      ClassCard.tsx
      BookingCard.tsx
      InvoiceLine.tsx
      TermCreditMeter.tsx       # NEW — the "X of 10 classes remaining · resets in Y weeks" element
      TutorRecommendationCard.tsx

  features/                     # one folder per business domain — screens + hooks + local components
    marketing/
      pages/LandingPage.tsx
    parent/
      pages/
        DashboardPage.tsx
        ChildrenPage.tsx
        ChildProfilePage.tsx
        BookAssessmentPage.tsx
        BookClassPage.tsx        # implements term-credit gating (Section 2.1)
        BookingsPage.tsx
        ReportsPage.tsx
        MessagesPage.tsx
        PaymentsPage.tsx
        EnrolmentPage.tsx
      hooks/
        useTermStatus.ts         # NEW — derives NO_TERM_EVER / ACTIVE_TERM / TERM_EXPIRED
        useBookingEligibility.ts # NEW — wraps the gating rules, used to disable/enable booking UI
        useChildren.ts
        useBookings.ts
        usePayments.ts
    admin/
      pages/ ... (one per Section 5 admin screen)
      hooks/
    teacher/
      pages/ ... (Section 6)
      hooks/

  lib/
    data/                       # data-access layer — see Section 8
    validation/                 # zod schemas
    utils/                      # date/formatting helpers, e.g. termWeeksRemaining()

  types/
    family.ts
    term.ts
    booking.ts
    child.ts
    teacher.ts
    payment.ts

  styles/
    globals.css                 # Tailwind directives + the handful of things that genuinely
                                 # need to stay as raw CSS (font imports, @keyframes for confetti,
                                 # print styles if any) — everything else becomes Tailwind utilities
                                 # or component classes, not one 200-line global stylesheet.
```

**Rule for the agent:** if a visual pattern appears more than twice in the current `index.css` (e.g. `.card`, `.status`, `.btn`, `.stat-card`), it must become a real component with props — not a CSS class re-applied by hand in every new screen.

---

## 8. Data-access layer (so mock data today ≠ rewrite tomorrow)

```
src/lib/data/
  client.ts          # exports either the mock implementation or the Supabase-backed one,
                      # switched by an env flag (e.g. VITE_DATA_SOURCE=mock|supabase)
  mock/
    families.ts
    children.ts
    terms.ts
    bookings.ts
    payments.ts
    teachers.ts
    reports.ts
    messages.ts
  supabase/
    families.ts       # real implementation, same function signatures as mock/, stubbed for now
    ...
  types.ts            # shared function signatures both implementations must satisfy
```

Every feature hook (`useChildren`, `useBookings`, etc.) calls through `lib/data/client.ts`, never directly imports mock arrays or a Supabase client. This is what makes "swap mock data for real backend later" a config change, not a rewrite — which matters given the current prototype has zero separation between UI and data (everything is inline arrays inside `App.tsx`).

---

## 9. Build order (do not attempt everything at once)

**Phase 1 — Foundation**
- Vite + TS + Tailwind config with tokens from Section 4
- Router skeleton with all routes from Section 5 (can be empty placeholder pages initially)
- `ui/` component library (Button, Card, Badge, Modal, Avatar, Progress, ProgressRing, StarRating, Table, Toggle)
- `AppShell` + `Sidebar` + `Header`, parameterised by role

**Phase 2 — Data layer + core types**
- All types in `types/` including the new Term/Family/gating model from Section 2.3
- Mock data implementation covering realistic multi-family, multi-child, multi-term scenarios (including at least one family in each of the three gating states, so the UI can be tested against all of them)
- `useTermStatus` / `useBookingEligibility` hooks

**Phase 3 — Parent app**
- Dashboard, Children, Child Profile, Bookings, Payments, Reports, Messages — direct ports of existing prototype screens, restructured into components
- Book Assessment flow (no gating — always available)
- Book Class flow **with term-credit gating fully implemented and visibly enforced in the UI** (disabled states, explanatory banners when locked, matching the prototype's existing `.unlock-banner` pattern)
- Enrolment flow

**Phase 4 — Admin portal**
- All screens from Section 5, ported
- Term/payment management screens must reflect the new family-level term model, not the old generic "tuition" line item

**Phase 5 — Teacher portal**
- Build per Section 6, clearly marking unconfirmed scope

**Phase 6 — Polish**
- Responsive breakpoints (the prototype has real, working responsive CSS at 1050px/780px/480px breakpoints — preserve this behavior in Tailwind's responsive variants)
- Notification/reminder scaffolding for term expiry (1–2 weeks before, per client confirmation)

---

## 10. Explicit non-goals for this rebuild pass

- Do not implement a real payment gateway — manual bank-transfer + proof-upload flow only, per SRS.
- Do not resolve the still-open pricing questions flagged in Section 2.3 — build the fields as configurable and flag them, don't guess and hardcode.
- Do not build native iOS/Android — this spec covers the responsive web app only; native wrapping is a separate effort.
- Do not attempt real Supabase auth/RLS policies in this pass unless explicitly asked — stub the auth context so role-based routing (`parent`/`admin`/`teacher`) works against mock sessions first.
