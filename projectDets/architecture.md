# Architecture — Fairybread & Fractions

> How the system is built today and how it is intended to evolve. Read `prd.md` first for the *what*.

---

## 1. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript 5 (strict) | `noUnusedLocals/Parameters` are off |
| UI | React 18 + Vite 5 | SPA, no SSR |
| Routing | `react-router-dom` v7, `createBrowserRouter` | Route tree in `src/app/router.tsx` |
| Server state | `@tanstack/react-query` v5 | All data goes through it |
| Client state | React Context (`AuthContext`) | `zustand` is installed but **unused** |
| Forms | local `useState` | `react-hook-form` installed but **unused** |
| Validation | none yet | `zod` installed but **unused** |
| Styling | Tailwind 3 (tokens only) **+ 499-line `src/index.css`** (actual styling) | Inline `style={{}}` is also common |
| Icons | `lucide-react` | Only icon library allowed |
| Backend | **None yet.** Mock in-memory client; Supabase client is a throwing stub | `@supabase/supabase-js` installed, **no client instance is created anywhere** |
| Build | `vite build`, `tsc --noEmit -p tsconfig.app.json`, ESLint 9 | Scripts: `dev`, `build`, `lint`, `typecheck`, `preview` |
| Path alias | `@/` → `src/` configured in `vite.config.ts` + `tsconfig.app.json` | **Currently unused** — code uses relative imports |

Project origin: scaffolded in Bolt (`.bolt/prompt`), then restructured per `Fairybread_Fractions_Rebuild_Spec.md`.

---

## 2. Folder & file structure (as it exists)

```
FairyBread-master/
├─ index.html                     # still has Bolt OG image + /vite.svg favicon (to fix)
├─ package.json                   # name is still "vite-react-typescript-starter"
├─ vite.config.ts                 # react plugin + '@' alias
├─ tailwind.config.js             # design tokens (colors, fonts, card shadow/radius)
├─ Fairybread_Fractions_Rebuild_Spec.md   # original rebuild spec (source of business rules)
├─ public/assets/image.png        # logo
└─ src/
   ├─ main.tsx                    # createRoot → <App/> + index.css
   ├─ App.tsx                     # <Providers><AppRouter/></Providers>
   ├─ index.css                   # ALL real styling (≈96 KB). Contains dead "Proposal" CSS
   ├─ app/
   │  ├─ providers.tsx            # QueryClientProvider + AuthContext (role, familyId) — MOCK auth
   │  └─ router.tsx               # full route tree
   ├─ components/
   │  ├─ layout/AppShell.tsx      # sidebar + header + notification drawer + DemoBar (demo only!)
   │  ├─ domain/TermCreditMeter.tsx   # "X of 10 credits · resets in Y weeks" + expiry banner
   │  └─ ui/  Button, Progress(+ProgressRing), Sprinkles(+Confetti), Table, Toggle
   ├─ features/
   │  ├─ marketing/pages/LandingPage.tsx
   │  ├─ auth/pages/  LoginPage, SignupPage
   │  ├─ parent/
   │  │  ├─ hooks/  useTermStatus, useBookingEligibility
   │  │  └─ pages/  ParentLayout, Dashboard, Children, ChildProfile, BookAssessment,
   │  │             Enrolment, BookClass, Bookings, Payments, Reports, Messages
   │  ├─ admin/pages/   AdminLayout, Home, Bookings, FamilyBooking, MyTeaching, Payments,
   │  │                 Messages, Tutors, Parents, Programs, WaitingLists, Settings
   │  └─ teacher/pages/ TeacherLayout, Dashboard, Classes, Students, Attendance,
   │                    Assessments, Reports, Messages
   ├─ hooks/useNotifications.ts   # notifications query + mark-read mutations
   ├─ lib/
   │  ├─ config.ts                # ALL pricing/term constants
   │  ├─ utils/termUtils.ts       # computeGatingState, getActiveTerm, termWeeksRemaining, isTermExpiringSoon
   │  └─ data/
   │     ├─ types.ts              # DataClient interface (the contract)
   │     ├─ client.ts             # picks mock|supabase via VITE_DATA_SOURCE
   │     ├─ mock/ client.ts, families.ts, messages.ts   # in-memory arrays (reset on refresh)
   │     └─ supabase/client.ts    # every method throws 'Supabase not implemented yet'
   └─ types/  family, term, booking, payment, teacher, message
```

Spec-intended but **not present yet**: `components/ui/{Card,Badge,Modal,Avatar,StarRating}`, `components/layout/{Sidebar,Header,ChildSwitcher}`, `components/domain/{ChildCard,ClassCard,BookingCard,InvoiceLine}`, `lib/validation/`, `parent/hooks/{useChildren,useBookings,usePayments}`, `lib/data/mock/{children,terms,bookings,payments,teachers,reports}.ts` (mock is consolidated in three files instead), `types/child.ts` (Child lives in `family.ts`).

---

## 3. Runtime architecture

```
 Browser
 ┌───────────────────────────────────────────────────────────────┐
 │ main.tsx → App → Providers → AppRouter                        │
 │                                                               │
 │  Providers: QueryClient + AuthContext{role, familyId}         │
 │                                                               │
 │  Router                                                       │
 │   /            LandingPage                                    │
 │   /login /signup  (mock auth → setRole/setFamilyId → navigate)│
 │   /parent/*  ParentLayout ─┐                                  │
 │   /admin/*   AdminLayout  ─┼─► AppShell(role, nav, title)     │
 │   /teacher/* TeacherLayout ┘        └─► <Outlet/> page        │
 │                                                               │
 │  Page ──useQuery/useMutation──► dataClient (interface)        │
 │                                    │                          │
 │                      VITE_DATA_SOURCE│                         │
 │                        ┌───────────┴───────────┐              │
 │                        ▼                       ▼              │
 │                 mockDataClient          supabaseDataClient    │
 │                 (module arrays)         (stub → throws)       │
 └───────────────────────────────────────────────────────────────┘
```

### 3.1 Request / data flow rule
`Component → (feature hook, optional) → useQuery/useMutation → dataClient.method() → mock | supabase`.
Components **must not** import mock arrays or the Supabase SDK directly.

### 3.2 Gating flow (the most important logic chain)

```
dataClient.getTerms(familyId)
   └─► useTermStatus(familyId)
         ├─ computeGatingState(terms)  → NO_TERM_EVER | ACTIVE_TERM | TERM_EXPIRED
         ├─ getActiveTerm(terms)
         ├─ termWeeksRemaining / isTermExpiringSoon
   └─► useBookingEligibility(familyId)
         → canBookRegularClass, canBookIndividualClass, block reasons,
           classesRemaining, weeksRemaining, expiringSoon, activeTerm
   └─► BookClassPage / DashboardPage / TermCreditMeter / (should also drive AdminFamilyBooking)
```
`end_date > now` is authoritative; the stored `Term.status` is intentionally **not** trusted for gating.

### 3.3 Payment → term activation flow

```
Parent: PaymentsPage → submitPayment({type:'term', status:'pending'}) → uploadPaymentProof
Admin : AdminPaymentsPage → getPendingPayments → verifyPayment(id,'approve'|'reject')
Mock  : on approve + type==='term' → push Term{active, start=now, end=now+70d, 10/10 credits}
Parent: invalidate ['terms', familyId] → gating becomes ACTIVE_TERM
```
Known gap: mock only creates the term if no active term exists (early renewal ignored).

### 3.4 Booking flow (target behaviour)

```
BookClassPage → confirm
   ├─ usingCredit  → dataClient.createBooking({source:'term_credit', credit_consumed:true})
   │                  → decrement term credits → invalidate ['bookings'], ['terms']
   └─ individual   → navigate('/parent/payments', state{type:'individual', classDetails})
                      → submitPayment(type 'individual_class') → admin approves
                      → createIndividualPurchase + createBooking({source:'individual_purchase'})
```
**Today only the individual path reaches the data layer; the credit path is UI-state-only (bug).**

---

## 4. Data model (`src/types/`)

```
Family            { id, parent_id, children: Child[] }
Child             { id, family_id, name, initials, year, school, enrolled?,
                    subjects?, preferredDays?, goals?, notes?, preferredTutor?, sessions? }
Term              { id, family_id, status:'active'|'expired'|'pending_payment',
                    start_date, end_date, classes_included, classes_booked,
                    classes_remaining, payment? }
ClassBooking      { id, family_id, child_id, class_instance_id,
                    source:'term_credit'|'individual_purchase',
                    status:'confirmed'|'waiting_list'|'cancelled', credit_consumed }
Assessment        { id, family_id?, child_id, teacher_id?, class_instance_id?, date?, time?,
                    outcome?:'pending'|'complete', payment_id? }
IndividualClassPurchase { id, family_id, class_booking_id, payment_id? }
Payment           { id, family_id, family_name?, type:'term'|'individual_class', amount, gst,
                    status:'pending'|'paid'|'failed'|'rejected', reference, receipt_filename?,
                    class_subject?, class_day?, class_time?, class_tutor?, child_name?,
                    term_label?, created_at }
Teacher           { id, name, initials, subjects[], color }
ClassInstance     { id, teacher_id, subject, day_of_week, time, capacity, enrolled, price }
StudentReport     { id, child_id, teacher_id, term, overall(1-5), subjects[{subject,rating}],
                    strengths, areas, note, created_at }
Conversation      { id, participant_ids[], participant_names[], participant_roles[],
                    last_message, last_message_at, unread_count, avatar_color }
ChatMessage       { id, conversation_id, sender_role, sender_name, body, created_at, is_reminder? }
AppNotification   { id, family_id?, teacher_id?, type, title, body, read, created_at, action_url? }
```
Notes: money is stored as plain numbers in dollars (`amount` + separate `gst`). Dates are ISO strings. Assessment payments currently reuse `type:'individual_class'` with `class_subject:'Assessment'` (should become its own type).

### 4.1 `DataClient` contract (`src/lib/data/types.ts`)
Families (`getFamily`, `getAllFamilies`) · Children (`getChildren`, `addChild`) · Terms (`getTerms`, `getActiveTerm`) · Bookings (`getBookings`, `createBooking`, `cancelBooking`) · Assessments (`getAssessments`, `createAssessment`) · Individual purchases (`getIndividualPurchases`, `createIndividualPurchase`) · Payments (`getPayments`, `submitPayment`, `uploadPaymentProof`, `getPendingPayments`, `verifyPayment`) · Teachers/Classes (`getTeachers`, `getClassInstances`) · Reports (`getReports`, `createReport`) · Teacher assessments (`getTeacherAssessments`, `createTeacherAssessment`) · Messages (`getConversations`, `getMessages`, `sendMessage`, `markConversationRead`) · Notifications (`getNotifications`, `markNotificationRead`, `markAllNotificationsRead`).

**Missing from the contract (must be added):** `updateChild`, `getAllChildren`, `getAllBookings`, `getAllPayments`, `getAllTerms`, class CRUD (`createClassInstance`/`updateClassInstance`/`deleteClassInstance`), attendance (`getAttendance`/`saveAttendance`), `createNotification`, waiting-list (`joinWaitingList`/`getWaitingList`), real user/profile lookup, settings.

### 4.2 Query keys in use
`['terms', familyId]`, `['children', familyId]`, `['bookings', familyId]`, `['classInstances']`, `['assessments', familyId]`, `['pendingPayments']`, `['allPayments']`, `['notifications', familyId, teacherId]`, plus conversation/message/report keys. After any mutation, invalidate every key that displays the changed entity (e.g. booking → `bookings` + `terms`).

---

## 5. Auth & roles (today vs target)

**Today (mock):** `AuthContext { role, familyId }` in `providers.tsx`. `LoginPage` checks a hard-coded email/password map and calls `setRole/setFamilyId`. No persistence (refresh resets to `parent/f1`), no route guards, teacher identity hard-coded to `tch1`, parent name hard-coded "Sarah Johnson" in `AppShell`, signup always assigns `f4`.

**Target:** Supabase Auth + a `profiles` table `{ id, role, family_id | teacher_id, full_name, phone }`. `AuthContext` exposes `{ user, role, familyId, teacherId, signIn, signOut }`. A `<RequireRole role="…">` wrapper guards each route group. Server-side RLS is the real security boundary.

## 6. Styling system
- Tokens exist twice: Tailwind (`tailwind.config.js`) and CSS variables (`:root` in `index.css`, e.g. `--pink`, `--teal`, `--muted`, `--line`).
- Real styling is global classes: `.card`, `.btn btn-{variant}`, `.page-stack`, `.page-toolbar`, `.table-status`, `.modal-backdrop/.modal`, `.unlock-banner`, `.class-card`, `.child-switcher`, `.stat-card accent-*`, `.app-shell` etc.
- Responsive breakpoints in `index.css`: 1050 / 780 / 480 px.
- Layout constants: sidebar 252px; header ~116px; main max-width 1500px; narrow flows ~780–1050px.
- Per spec, any pattern used >2× should become a component with props; migrate incrementally, **without changing the look**.

## 7. Environment & configuration
- `VITE_DATA_SOURCE=mock|supabase` (default `mock`).
- Future: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. No `.env.example` exists yet — create one.
- Business constants only in `src/lib/config.ts`: `TERM_BASE_PRICE=500`, `REGISTRATION_FEE=30`, `GST_RATE=0.1`, `INDIVIDUAL_CLASS_PRICE=50`, `TERM_CREDITS=10`, `TERM_WEEKS=10`, `TERM_EXPIRY_WARNING_WEEKS=2`, `TEACHER_PRICE_IS_PARENT_FACING=false`, `TERM_TOTAL`.

## 8. Target backend shape (Supabase, when implemented)
Tables: `profiles`, `families`, `children`, `terms`, `class_instances`, `teachers`, `class_bookings`, `assessments`, `individual_class_purchases`, `payments`, `student_reports`, `attendance`, `conversations`, `conversation_participants`, `messages`, `notifications`, `waiting_list`, `settings`.
Storage bucket: `payment-proofs` (private; parent writes own, admin reads all).
RLS: parent → own `family_id` rows only; teacher → own classes/students/reports/conversations; admin → all.
Scheduled job (Supabase cron / Edge Function): daily, create `term_expiring` notification + message for terms ending within `TERM_EXPIRY_WARNING_WEEKS`.
Credit changes (book/cancel) should be done in a Postgres function/transaction, not two client calls, to avoid double-spend.
