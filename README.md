# Load Testing Tracker

A small app for running Talview load tests: candidates self-report how each step of a real test session went, on their own device, while a separate admin/moderator console tracks progress, flags issues, and reports on the results.

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router 7
- **Backend**: Supabase (Postgres, Auth, Row Level Security, Storage, one Edge Function)
- **Hosting**: static build on GitHub Pages, deployed via GitHub Actions on every push to `main`

## How it's organized

There are three separate consoles, each gated differently:

| Console | Route | Who | Auth |
|---|---|---|---|
| Candidate self-report form | `/t/:testSlug` | Anyone with the link + a registered email | None — email lookup via a `SECURITY DEFINER` RPC |
| Admin console | `/admin/...` | Staff with `profiles.role = 'admin'` | Supabase Auth (email/password) |
| Moderator console | `/moderator/...` | Staff with `profiles.role = 'moderator'`, **or an admin** (admins are moderators by default — see below) | Supabase Auth (email/password) |

The candidate side never gets a Supabase Auth session — it identifies people purely by test slug + email, through RPC functions that run as `SECURITY DEFINER` so they can bypass RLS in a controlled way (see `supabase/migrations/`).

### Key source layout

```
src/
  routes/
    candidate/     the self-report form (EmailGate -> StepForm -> StepRow)
    staff/         shared staff auth/login/nav (AuthContext, Login, RequireRole, TopNav, ResetPassword)
                   + CandidateForm (one candidate's report, used by both admin and moderator)
    admin/         TestList, CreateTest, Candidates, Steps, Moderators, Report, ModeratorSelect
    moderator/     DashboardHome, Dashboard, LiveMonitoring
  components/      shared UI: EvidenceList, IssuesSection, ui.tsx primitives (incl. Modal, PageHeader,
                   LoadingState, ErrorState, RefreshButton, FieldLabel), Logo
  lib/             candidateApi.ts, staffApi.ts (all Supabase calls), outcome.ts (formatting),
                   storagePath.ts (filename sanitizing), useAsyncLoad.ts (load/timeout/error hook),
                   csv.ts, supabase.ts (client)
supabase/
  migrations/       0001_init.sql (schema, RLS, RPCs)
                     0002_multi_evidence.sql (multi-file evidence array columns + RPC rebuild)
                     0003_staff_evidence_upload.sql (authenticated staff can upload evidence)
                     0004_candidate_evidence_read.sql (anon/candidates can read evidence back)
  functions/        create-moderator (Edge Function — invites a new admin or moderator)
  seed_dev.sql      sample data for local development
```

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

`npm run build` type-checks (`tsc -b`) then produces a static `dist/` build, copying `index.html` to `dist/404.html` so GitHub Pages serves the SPA correctly on deep links.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the app (using the `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` repo secrets) and publishes `dist/` to GitHub Pages. The Vite `base` and the router's `basename` are both set to `/load-testing-tracker/` for production builds (see `vite.config.ts` and `src/main.tsx`) — only for `dev` do they fall back to `/`.

Database changes are **not** part of this pipeline — SQL migrations under `supabase/migrations/` and the `create-moderator` Edge Function are applied manually through the Supabase dashboard (SQL Editor / Edge Functions), since this project doesn't use the Supabase CLI for automated migration deploys.

## Feature history

### Initial build
Full candidate self-report flow (email gate → per-step outcome/comment/evidence → issue logging → submit), and the admin console (create tests, manage steps, manage candidates, assign moderators, CSV export, a metrics report), plus a moderator console (assigned-candidate dashboard, live monitoring of staleness, working a candidate's form on their behalf). Deployed to GitHub Pages with Supabase as the backend.

### Admin UI feedback round
- Fixed the moderator-assignment dropdown getting clipped by the candidates table's scroll container (portaled it to `<body>` with `position: fixed`).
- Moved "Add Candidate" to a row below the last candidate, instead of a separate button elsewhere.
- Made step names and their required/optional flag editable inline on the Steps tab.

### Multi-evidence, editable timestamps, and reporting round
This is the largest round of changes, spanning schema, API, and UI:

- **Admins are moderators by default.** Admins now show up in every "assign a moderator" picker, and can enter the moderator console (`/moderator/...`) in addition to `/admin` — useful when an admin wants to personally work a candidate assigned to them. A "Moderator View" button on the admin test list, and a "Back to Admin Console" link from the moderator dashboard, move between the two.
- **Copy steps between tests.** Creating a new test offers an optional "copy steps from" dropdown, so a recurring test format doesn't need to be rebuilt by hand each time.
- **Editable test name**, directly from the Candidates tab header.
- **Fixed the moderator dropdown for real this time.** The earlier portal fix wasn't enough near screen edges — it now measures its own size after mounting and flips above the button / clamps horizontally so it's never cut off, and scrolls internally for long moderator lists.
- **12-hour time everywhere.** All timestamps (`formatTime` in `src/lib/outcome.ts`) are forced to 12-hour, since locale defaults silently switch to 24-hour time on many systems.
- **Editable timestamps.** Staff can correct the "saved at" time on a step report or the "logged at" time on an issue, via a small pencil icon next to the timestamp that opens a native `<input type="time">`.
- **Multiple evidence files (up to 5).** `step_reports.evidence_path` / `issues.evidence_path` (single file) became `evidence_paths` (array), enforced with a Postgres check constraint (`array_length(...) <= 5`, and 1–5 for issues, which always require at least one). A shared `EvidenceList` component handles upload/list/remove/download everywhere evidence appears.
- **Issues & Disconnections redesigned.** The form is now collapsed behind an "Add Issue / Disconnection" button (instead of always being open); it supports the same multi-evidence upload as steps, and captures/allows editing the logged-at time.
- **Steps tab**: added delete (with a confirmation warning about cascading report deletion) and native HTML5 drag-and-drop reordering, alongside the existing inline name/required editing.
- **Session Timeline chart** on the Report tab: every step save and logged issue, plotted as a scatter/swimlane chart with one row per candidate (Y-axis = candidate email) against real time on the X-axis, colored by outcome, with issues shown as a distinct marker.
- **"Invite Staff" (not just moderators).** The invite form on the Moderators tab now lets an admin choose Admin or Moderator as the role for the new invite, and the moderator table shows a Role badge. (No new access tier was introduced — any admin can invite either role; there's no separate "super admin" concept.)
- **Moderator table noise reduction.** A test's Moderators tab now only lists moderators who actually have a candidate assigned on that specific test, instead of every moderator/admin in the org.

Migration `0002_multi_evidence.sql` (the evidence array conversion + RPC rebuild) and the `create-moderator` Edge Function update (the `role` parameter) both had to be applied by hand in the Supabase dashboard, since they're outside the GitHub Actions deploy pipeline.

### Admin UI polish round 2

- **Delete candidates** — but only while they have no reported data yet (no step outcomes, not submitted), to make accidental data loss much harder.
- **Edit candidate email** moved to sit directly next to the email itself (was a separate column), with long emails truncated and a hover tooltip for the full address.
- **"Add Team Member"** (renamed from "Invite Staff"), its modal widened to match the table below it, with Full Name and Email placed side-by-side in the extra width.
- **"Load Testing Tests" → "Tests"** on the admin home page.
- Fixed a real alignment bug in the Candidate Funnel chart (`100%` wrapping onto its own line for the widest value) — the stat column now has a fixed width instead of relying on flex to leave enough room.
- **Session Timeline reverted back to real time on the x-axis** after a brief experiment plotting it by step sequence instead — time reads better for spotting when problems clustered.

### Evidence storage permissions, candidate-side viewing, and form correctness round

Digging into "candidates can't see a preview of their evidence" surfaced two separate, more serious problems underneath — one a missing permission, one a genuine upload bug:

- **Staff couldn't upload evidence at all.** The original storage policy only ever granted `anon` (candidates) permission to *upload* evidence, never `authenticated` (staff/admin). Every "edit on behalf of" evidence upload was silently rejected by RLS. Fixed by `0003_staff_evidence_upload.sql`.
- **Candidates couldn't view evidence after a page reload.** Only staff had read access to the bucket; a candidate's own upload was visible for a moment via a local blob preview, then vanished — no way to view or download it again. Fixed by `0004_candidate_evidence_read.sql` (chosen deliberately over a scoped/verified RPC: the whole bucket is now anon-readable, which is simpler but means a leaked/guessed object path has no per-candidate identity check — paths aren't guessable in practice, but it's not the same guarantee as "only that candidate can read their own file").
- **The real bug: uploads silently failed whenever the original filename had spaces or punctuation** — which is every default macOS screenshot (`Screenshot 2026-09-05 at 7.08.43 AM.png`). Supabase Storage rejects such keys outright ("Invalid key"), and since nothing caught the error, the upload just did nothing with zero feedback. This is what actually looked like "no preview available." Fixed with a `sanitizeFilename()` helper (`src/lib/storagePath.ts`) used by both `uploadEvidence` and `uploadEvidenceStaff`, and evidence upload failures now surface as a real inline error instead of failing silently.
- **Evidence preview made more robust**: image detection now falls back to file extension when the browser doesn't report a MIME type, and the signed-URL preview fetch uses `Promise.allSettled` instead of `Promise.all` so one inaccessible file doesn't blank out the rest (or throw an unhandled rejection).
- **10MB client-side file size limit** on evidence uploads, rejected before any network request with a clear inline message; the attach button also shows the limit as a tooltip.
- **Candidates can now view/download their own evidence** via the same `EvidenceList`/`IssuesSection` components staff already used, backed by a new `getEvidenceViewUrl` in `candidateApi.ts`.

### Sticky headers, modal-based issue reporting, and required-field indicators

- **The top nav bar and each page's title block now both stay pinned while scrolling** (a shared `PageHeader` component sits right below the sticky `TopNav`), across every admin, moderator, and candidate/staff page.
- **"Add Issue / Disconnection" moved next to the candidate's email at the top of the page**, and opens in a proper centered modal dialog instead of expanding inline — `IssuesSection` now exposes an imperative `open()` via `forwardRef`/`useImperativeHandle` so the header button can trigger it.
- **Red required-field asterisks** (`FieldLabel`'s new `required` prop) added consistently across every form with a real requirement: Report an Issue, Add Team Member, Create Test, the candidate Email Gate, staff Login (both modes), Reset Password, Add Candidate, and Add Step.
- **Comments become mandatory** on a step whenever the candidate picks "Completed with issues" or "Was not able to complete" (shown with a red star, enforced at submit time) — previously always optional regardless of outcome.
- **Step names now show a red star when the step itself is admin-configured as required**, matching the existing optional/required flag on the Steps tab.
- Fixed a real bug this surfaced: outcome/comment/evidence edits were never synced back into the page's own session/candidate state after saving, only fetched once on page load — so the submit-time "missing evidence/comment" validation was silently checking stale data and would have let incomplete submissions through. Both the candidate and staff step-save handlers now keep that state in sync.
- **Loading states now time out and show a real error with Retry** instead of an infinite spinner (`useAsyncLoad` hook, shared `LoadingState`/`ErrorState` components) — applied to every data-loading page. This was the direct fix for production getting stuck on "Loading…": the deployed frontend was running old code against a database that already had the newer migrations applied, so every request errored, and with no error handling that error just produced a silent, permanent spinner.
- A refresh icon was added to the header of every page with a table, to re-fetch data on demand without a full reload.
