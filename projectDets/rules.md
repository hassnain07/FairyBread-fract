# Rules — Fairybread & Fractions

> Hard rules for any human or AI agent working in this repo. If a request conflicts with a rule here, **stop and ask** instead of silently breaking the rule.
> Context: `prd.md` (what), `architecture.md` (how), `phases.md` (order of work), `memory.md` (current state).

---

## 1. Golden rules (read these even if you read nothing else)

1. **Do not redesign.** Colors, fonts, spacing, radii, copy tone and layout are fixed. This is a functionality/structure project, not a visual one.
2. **Components never touch data sources directly.** All data goes `component → useQuery/useMutation → dataClient`. No mock-array imports, no `supabase.from(...)` inside components.
3. **Gating logic lives in exactly one place:** `src/lib/utils/termUtils.ts` + `useTermStatus` + `useBookingEligibility`. Never re-derive "can this family book?" inline.
4. **No hard-coded business values.** Prices, GST, credits, weeks, warning window → `src/lib/config.ts` only.
5. **No hard-coded identity or data in UI.** No `'f1'`, `'tch1'`, `'Sarah'`, `'Therese'`, `FAMILY_NAMES`, `ALL_FAMILY_IDS`, or inline class/booking arrays in pages. Get them from auth context or the data layer.
6. **Do not guess open business questions.** Keep them configurable and keep the `// TODO: confirm with client` marker (see `prd.md` §3.5).
7. **Make the smallest change that satisfies the task.** No drive-by refactors, renames, or reformatting of unrelated files.
8. **Work in small steps and keep `npm run typecheck` and `npm run lint` passing** after each one.

---

## 2. What to use

| Need | Use | Notes |
|---|---|---|
| Language | TypeScript, `strict` | No `any` unless unavoidable and commented |
| Components | Function components + hooks | No class components |
| Server state | `@tanstack/react-query` v5 | `useQuery`, `useMutation`, `invalidateQueries` |
| Routing | `react-router-dom` v7 | Add routes only in `src/app/router.tsx` |
| Global client state | React Context (auth) | Use `zustand` only for tiny UI state (e.g. selected child) if needed |
| Forms | `react-hook-form` + `zod` (already installed) | Use for **new** multi-step forms; migrate old `useState` forms only when touching them |
| Icons | `lucide-react` only | No other icon packages |
| Styling | Existing global classes in `index.css` → Tailwind utilities with the tokens in `tailwind.config.js` | Reuse an existing class before adding a new one |
| Imports | `@/…` alias for new/edited files | e.g. `@/lib/data/client`. Do not mass-rewrite existing relative imports |
| Dates/money | `toLocaleDateString('en-AU', …)`; money as numbers in AUD with a separate `gst` | Format at the edge only |
| Backend (later) | `@supabase/supabase-js` behind `src/lib/data/supabase/` only | |

## 3. What to avoid

- **New dependencies.** Do not add UI kits, state libraries, date libraries (moment/dayjs), CSS-in-JS, or form libraries. If you truly need one, ask first and justify.
- **`localStorage` for business data.** Allowed only for trivial UI preferences; never for terms, credits, bookings, payments, auth.
- **Duplicating a visual pattern a third time.** If a modal/badge/card/stat pattern appears more than twice, extract a component (`Modal`, `Badge`, `Card`, `Stat`) instead of copy-pasting markup or inline styles.
- **New inline `style={{…}}` blocks** for anything reusable. Prefer a class or Tailwind utilities.
- **Reading `Term.status` for gating.** The calendar (`end_date > now`) is authoritative.
- **Creating a new record when you mean to update one** (existing bug: enrolment calls `addChild`; use `updateChild`).
- **Fetching "all X" by looping over hard-coded family IDs.** Add a proper `getAllX()` to the `DataClient`.
- **Leaving demo scaffolding in production paths** (`DemoBar`, mock credentials, "Demo credentials" box on login).
- **Trusting the UI for security.** Role checks in React are convenience only; real enforcement is RLS on the server.
- **Resurrecting the Proposal page** or its CSS. It is intentionally gone.
- **Editing `Fairybread_Fractions_Rebuild_Spec.md`** — it is a historical source document. Put current truth in these five files.

---

## 4. Data-layer rules

- Every new capability = **(a)** add method to `DataClient` interface in `lib/data/types.ts`, **(b)** implement in `mock/client.ts`, **(c)** add a throwing stub (or real impl) in `supabase/client.ts` with the same signature. All three or none.
- Mock behaviour must mirror the real rules (credit decrement on credit booking, restore only if cancelled ≥24h before, term activation on approved term payment, notification creation on events). The mock is the executable spec.
- Mutations must invalidate **every** affected query key (see `architecture.md` §4.2). A booking mutation invalidates at least `['bookings', familyId]` and `['terms', familyId]`.
- Credit changes must be atomic. In the mock, do it in one function; in Supabase, use a single Postgres function/transaction.
- Never mutate objects returned from the data client; return new objects.
- IDs: mock uses `prefix + Date.now()`; do not parse meaning out of IDs.

## 5. Error handling

- **Every `useQuery` page** handles three states: loading (skeleton or "Loading…"), error (friendly message + retry), empty (explanatory empty state with a next action). No blank screens.
- **Every `useMutation`** has `onError` that shows a visible message (inline banner or toast-style element using existing classes) and re-enables the UI. Never swallow errors with an empty `catch`.
- Fire-and-forget promises (`dataClient.x().then(...)` with no catch — as in `EnrolmentPage.completeEnrolment`) are **not allowed**; use `useMutation` and advance the UI in `onSuccess`.
- Data-layer methods **throw `Error` with a human-readable message** on failure; they never return `null` for "something went wrong".
- Validate user input at the form boundary with `zod`; show field-level errors using the existing `.auth-error` / form error styling.
- Never show raw error objects/stack traces to users. Log technical detail with `console.error` only.
- Auth failures: generic message ("Incorrect email or password") — don't reveal whether the email exists.
- File uploads (payment proof): validate type (image/PDF) and size client-side; show the failure reason.
- Add an app-level React error boundary so one crashed page doesn't blank the shell.

## 6. Code conventions

- One page per file in `features/<area>/pages/`, named `<Name>Page.tsx`, exported as a named export.
- Feature-specific hooks in `features/<area>/hooks/`; cross-feature hooks in `src/hooks/`.
- Presentational, reusable pieces → `components/ui` (no business logic) or `components/domain` (business-aware, still presentational).
- Keep files focused; if a page exceeds ~400 lines, extract sub-components into the same feature folder.
- Naming: components `PascalCase`; hooks `useThing`; constants `UPPER_SNAKE`; types `PascalCase`; query keys are arrays starting with a plural noun.
- Comments explain **why** (especially business assumptions). Keep every existing `TODO: confirm with client` marker and add one wherever a new assumption is made.
- Keep UI copy in the existing warm, friendly tone; Australian English (enrolment, programme/program as already used, `en-AU` dates).

## 7. Boundaries for AI agents

### Allowed without asking
- Fixing bugs listed in `phases.md`.
- Adding `DataClient` methods (with all three implementations).
- Replacing hard-coded data with data-layer queries.
- Extracting shared components **without changing visual output**.
- Adding types, tests, `.env.example`, route guards.

### Ask first
- Adding any dependency.
- Changing any price, fee, credit count, term length, or cancellation window (these are client decisions).
- Changing the gating rules or the meaning of a state.
- Changing the DB/schema shape once Supabase work starts.
- Altering visual design, copy tone, or the navigation structure.
- Deleting a page/route, or removing a feature.
- Anything that touches real credentials, production Supabase projects, or sends real emails/SMS.

### Never
- Invent client requirements, prices, or policies.
- Commit secrets; use `VITE_` env vars and keep `.env*` out of git (already ignored via `*.local`; add `.env` to `.gitignore` when created).
- Disable lint/type checks, or use `@ts-ignore`/`eslint-disable` to get past a real error.
- Hard-wire Supabase calls outside `src/lib/data/supabase/`.
- Leave the app in a broken state at the end of a task; if blocked, revert to the last working state and report.
- Claim something works without having run `npm run typecheck`, `npm run lint`, and `npm run build` (and exercised the flow for each gating state when relevant).

### When unsure
State the assumption in one line, pick the **least destructive** option, mark it `// TODO: confirm with client`, and continue — unless it falls under "Ask first".

## 8. Definition of done (every task)

1. `npm run typecheck`, `npm run lint`, `npm run build` all pass.
2. No new hard-coded IDs/names/prices; no new inline-style blobs for reusable UI.
3. Behaviour verified against **all three gating states** using demo families: `f1` (active, 3 credits), `f2` (active, 0 credits), `f3` (expired), `f4` (no term ever) — if the task touches booking, payments, or dashboards.
4. Parent, admin and teacher views that display the changed data all update (query invalidation checked).
5. `memory.md` updated: what changed, what's now true, new known issues.
