# Crowd Test Tracker

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
    candidate/     the self-report form (EmailGate -> StepForm, a wizard/preview orchestrator ->
                   NetworkCheck, StepRow, StepPreview)
    staff/         shared staff auth/login/nav (AuthContext, Login, RequireRole, TopNav, ResetPassword)
                   + CandidateForm (one candidate's report, used by both admin and moderator)
    admin/         TestList, Users, CreateTest, Candidates, Steps, Moderators, Report, ModeratorSelect
    moderator/     DashboardHome, Dashboard, LiveMonitoring
  components/      shared UI: EvidenceList, IssuesSection, SessionLog (chronological step + disconnection
                   history, used by both the candidate's Preview and staff's CandidateForm), ui.tsx
                   primitives (incl. Modal, PageHeader, LoadingState, ErrorState, RefreshButton,
                   FieldLabel), Logo
  lib/             candidateApi.ts, staffApi.ts (all Supabase calls), outcome.ts (formatting),
                   storagePath.ts (filename sanitizing), useAsyncLoad.ts (load/timeout/error hook),
                   csv.ts, supabase.ts (client)
supabase/
  migrations/       0001_init.sql (schema, RLS, RPCs)
                     0002_multi_evidence.sql (multi-file evidence array columns + RPC rebuild)
                     0003_staff_evidence_upload.sql (authenticated staff can upload evidence)
                     0004_candidate_evidence_read.sql (anon/candidates can read evidence back)
                     0005_service_role_grants.sql (baseline table access for service-role Edge Functions)
                     0006_candidate_edit_timestamps.sql (candidates can correct their own step/issue times)
                     0007_user_active_status.sql (profiles.active, for deactivate/reactivate)
                     0008_clear_saved_at_on_uncheck.sql / 0009_fix_uncheck_saved_at_preserve.sql
                     (un-checking a step's outcome clears/preserves its recorded time)
                     0010_two_outcomes.sql (outcome collapses from 3 values to 2: completed / unable)
                     0011_network_check_step.sql (steps.is_network_check, the fixed one-time gate)
                     0012_fix_issues_step_delete.sql (issues.step_id on delete cascade)
                     0013_step_attempts.sql (candidates.current_attempt / step_reports.attempt --
                     a disconnection starts a new attempt, so a re-answered step becomes a new
                     row instead of overwriting the old one)
                     0014_session_log.sql (rpc_get_candidate_state also returns step_report_history,
                     every attempt's step submissions, for the candidate-facing Session Log)
                     0015_drop_issue_has_a_step.sql (issues no longer require a step_id/custom_step_name)
  functions/        create-moderator (Edge Function — invites a new admin or moderator)
                     manage-users (Edge Function — admin: delete/deactivate/reactivate a user, change
                     their login email, generate invite/reset links without sending email)
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

Database changes are **not** part of this pipeline. SQL migrations under `supabase/migrations/` and the Edge Functions under `supabase/functions/` can be applied either through the Supabase dashboard (SQL Editor / Edge Functions) or, once `npx supabase login` has been run once on a machine, via the CLI:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push                              # applies pending migrations
npx supabase functions deploy <function-name>      # e.g. manage-users, create-moderator
```

The migration history table only tracks migrations applied via the CLI — since earlier ones in this project were pasted into the SQL Editor by hand, a fresh clone may need `supabase migration repair --status applied <version...>` for the already-applied ones before `db push` will treat them as up to date.

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

### Admin Users tab

A new `/admin/users` page lists every admin/moderator account across the whole org (not scoped to one test), replacing the invite form that used to live on each test's Moderators tab (now a read-only workload table pointing here instead).

- **List, edit, delete, invite** — backed by a new `manage-users` Edge Function for the operations that need the service role (delete, changing a user's login email) and the existing `create-moderator` function (now also parameterized by role) for invites.
- **Resend password reset** and **invite**, each with two variants: the normal one sends an email via Supabase Auth (subject to its built-in per-project email rate limit), and a "generate link" alternative calls `auth.admin.generateLink` server-side and copies the raw link to the clipboard instead — sidesteps the rate limit entirely for an admin who wants to share a link directly (Slack, WhatsApp, etc).
- A hardcoded `PROTECTED_EMAILS` list (currently just the org's original admin account) can never be deleted, checked both client-side (button disabled) and server-side in `manage-users` (the actual enforcement point) — a deliberate safeguard against ever locking the whole org out of the admin console.

### Deactivate/reactivate users, bulk candidate upload, bulk moderator assignment, and rename to Crowd Test Tracker

- **Deactivate/reactivate a user** from the Users tab — bans/unbans the Supabase Auth account (`auth.admin.updateUserById` with `ban_duration`) so they can't sign in, tracked in a new `profiles.active` column. Deliberately does **not** check or touch their existing candidate assignments the way delete does — those stay exactly as they were; reassigning is a separate, optional step. The protected account can't be deactivated either, for the same reason it can't be deleted; an admin can't deactivate their own account (server-enforced).
- **Bulk-upload candidates from a spreadsheet** (`.xlsx`, `.xls`, or `.csv`) — one email per row in the first column; a header row is detected and skipped automatically since it doesn't parse as an email. Already-registered and malformed rows are counted and skipped with a clear preview before anything is written (`bulkAddCandidates` upserts with `ignoreDuplicates: true`, so re-uploading an overlapping list is safe). Parsing uses SheetJS's `xlsx` library, dynamically `import()`-ed only when the Bulk Upload modal is actually used (it's a large library, and this keeps it out of the main bundle for everyone who never touches the feature). Installed from `cdn.sheetjs.com` rather than the npm registry, since the npm-published build has long-unpatched high-severity CVEs (prototype pollution, ReDoS) that SheetJS's own maintainers only fix in their own CDN builds.
- **Multi-select candidates and bulk-assign a moderator** — checkboxes on the Candidates table (with a select-all in the header) reveal an action bar for assigning all selected candidates to one moderator (or unassigning) in a single update. Deactivated moderators are deliberately excluded from this dropdown (they can't act on new work), unlike the existing per-candidate assignment picker, which is left showing everyone so an already-made assignment to a since-deactivated moderator still displays correctly.
- **Renamed the displayed app name** from "Load Testing Tracker" to "Crowd Test Tracker" — cosmetic only (page title, README, every in-app wordmark). The GitHub Pages URL, `package.json` name, and the Edge Functions' hardcoded reset-password redirect URL were deliberately left as `load-testing-tracker` to avoid breaking existing links or already-sent invite/reset emails.
- **Fixed a real bug found while building the above**: `supabase.functions.invoke()`'s `error.message` for a non-2xx Edge Function response is a generic "Edge Function returned a non-2xx status code" — the actual reason our own functions send back as JSON body was being silently discarded. A shared `invokeFunction` helper in `staffApi.ts` now reads it from `error.context` instead, so real errors (e.g. Supabase's email rate limit) show up in the UI instead of a meaningless generic message.

### Un-checkable step outcomes, and nudges toward incomplete or skipped steps

- **A candidate can now un-select a step's outcome radio** by clicking it again (native radios can't normally be unchecked this way, so it's wired through `onClick` rather than `onChange`), behind a confirmation dialog. If nothing else is recorded for that step (no comment, no evidence), the recorded time is cleared along with it; if a comment or evidence is still attached, the time is left exactly as it was — the confirmation message tells the candidate which will happen. Required a change to `rpc_upsert_step_report` (`0008_clear_saved_at_on_uncheck.sql`, corrected in `0009_fix_uncheck_saved_at_preserve.sql`), since it previously stamped the time forward to now() on *any* outcome change, including clearing it.
- **Found and fixed a real race condition while building the above**: unchecking a step right after editing its comment (a very natural sequence — type, then change your mind about the outcome) could fire two saves close enough together that whichever's network response landed last would silently win, sometimes reverting the outcome you'd just cleared. `StepRow` now chains every save for a given step through a small queue so they always resolve in the order they were triggered, never overlapping.
- **Live inline nudge**: a step whose outcome requires a comment (with issues / unable to complete) or evidence, but doesn't have one yet, shows an inline warning right on that step — not just at submit time.
- **Submit-time nudge**: clicking Submit with incomplete required steps still shows the existing summary message, but now also scrolls to and briefly highlights the first incomplete one, instead of leaving the candidate to hunt through the whole form for it by name.
- **Skipped-step nudge**: picking an outcome for a step while an earlier step is still completely untouched shows a dismissible banner naming the skipped step(s) — catches the "filled in step 5, forgot steps 2–4" case that the existing required-field validation wouldn't (an untouched optional-looking gap, not a missing comment/evidence on a step that was actually started).

### Report refinements: step filter, tooltips, idle moderators, funnel correction

- **Session Timeline step filter**: a checklist of every step name (with Select all / Clear all) above the chart lets an admin isolate specific steps' events instead of always seeing all of them together — dot color stays tied to outcome rather than step identity, since color-coding a dozen-plus steps at once would be indistinguishable at a glance.
- **Hover tooltips** on every summary stat explaining what it counts, and **"Registered" renamed to "Invited"** (both the stat tile and the funnel's first row) to match how candidates actually get into a test.
- **Moderator Distribution hides moderators with zero candidates** on the test, instead of listing the org's entire moderator roster.
- **Candidate Funnel excludes "unable" outcomes from each step's count** — a candidate who was unable to complete a step didn't actually make it through it, so counting them toward that stage overstated how far the cohort progressed. Biggest Drop-Off recalculates from the corrected counts.

### Step-by-step wizard, a one-time network check, disconnection restart, and a two-outcome model

The candidate form was one long scrolling page listing every step at once; it's now a step-by-step wizard, with several related changes that came with it:

- **Outcomes collapse from three to two**: "Completed without issues" and "Completed with issues" merge into a single **Completed**, alongside **Was not able to complete** — the "with issues" nuance is still capturable via the step's own comment/evidence, which was never gated on that distinction anyway. Required a data migration (`0010_two_outcomes.sql`) merging existing rows and narrowing the `outcome` check constraint, plus removing every now-meaningless "With Issues" stat/column across `Report.tsx`, the Moderators workload table, and the moderator Dashboard.
- **The network check is a fixed, one-time gate**, not an admin-configured step — every candidate does it once, right after the email gate, before Step 1, and it's never shown again for the rest of their session (including after a disconnection restart). Implemented as an ordinary `steps` row flagged `is_network_check` rather than a parallel data model, so it reuses the exact same evidence/comment/timestamp machinery as any other step; `listSteps()` excludes it by default, so every existing consumer (admin Steps page, per-step report columns, `copyStepsFromTest`) automatically leaves it out with no other changes. `0011_network_check_step.sql` backfills existing tests by flagging an existing "Network test"-named first step in place (preserving its real history) rather than duplicating it, and `createTest()` now inserts one automatically for every new test.
- **The wizard shows one step at a time**, with a **Next** button (becoming **Review & Submit** on the last step), a **← Back** button, and a step-name dropdown to jump directly to any step. **Picking an outcome is now mandatory before Next is enabled** — previously a step with no outcome recorded at all wasn't blocked. The skipped-step nudge now triggers on navigation past an untouched earlier step, since that's the only way skipping can happen in a wizard.
- **A "Preview" button shows a read-only summary** of every step's current answer (outcome, comment, evidence, timestamp) on one page, with Submit Form (and its validation) living there instead of in the wizard; clicking a step in Preview jumps back into the wizard at that step to edit it. A failed submit now switches back into the wizard at the first incomplete step and highlights it, instead of scrolling within a page that no longer lists every step at once.
- **"Add Issue / Disconnection" is relabeled "Disconnection"** at the top of both the wizard and Preview (same modal, still requires a comment and evidence). Logging one resets the candidate back to Step 1 — already-saved answers for every step are untouched, only where they're looking resets, matching "refreshing the assessment page and starting from the beginning."
- **Report gets three new activity counters**: Forms Submitted, Steps Submitted (total step outcomes recorded across every candidate), and Disconnections Logged, plus a small proportional bar comparing steps vs disconnections.
- **Fixed a real, pre-existing bug surfaced while testing this**: deleting a test with a candidate whose logged issue referenced a specific step failed outright (`issues_step_id_fkey` had no delete action, while `issues.candidate_id` already cascaded — Postgres could hit the step-side constraint before the candidate-side cascade removed the row). `0012_fix_issues_step_delete.sql` adds `on delete cascade` to match.

### Wizard polish: inline step dropdown, preview-only disconnection log, and per-attempt resubmission

- **The step dropdown now sits inline in the step's own heading** (`StepRow`'s `nameSlot` prop swaps in the `<select>` in place of the plain step name) instead of as a separate row above the card.
- **The Issues & Disconnections list only renders in Preview**, not on every step of the wizard — the Disconnection button/modal (`IssuesSection`'s `hideList` prop) still works identically from both views.
- **A disconnection now starts a genuinely new attempt** rather than just resetting where the candidate is looking. `0013_step_attempts.sql` adds `candidates.current_attempt` and `step_reports.attempt` (the unique constraint becomes `(candidate_id, step_id, attempt)`); every RPC that reads or writes `step_reports` now scopes to the candidate's current attempt, except the network check, which stays exempt so it's still never repeated. Re-answering a step after a disconnection writes a brand-new, separately-timestamped row instead of overwriting the old one — the candidate's own view (and every "current status" admin view: Candidates table, funnel, step stats) only ever shows the current attempt, so the old answer isn't shown as if it still stood, but nothing is deleted. The Report's Session Timeline is the one place that shows every attempt, via a new `listStepReportHistoryForTest`, so a step answered twice across a disconnection now plots as two separate dots.
- **The "Was not able to complete" outcome label was renamed to "Completed with issues"** (`OUTCOME_LABEL.unable`) — the underlying `unable` value and its logic (comment required, excluded from the funnel) are unchanged, only the wording shown to candidates and in the Report tooltip.
- **Preview gains a "Session Log"**: a chronological list of every step submission (across every attempt) and every disconnection, in the order they happened — so a step answered, then disconnected, then re-answered shows as "Step 1, Step 2, Disconnection logged, Step 1, Step 2" rather than only the latest state. `0014_session_log.sql` adds `step_report_history` to `rpc_get_candidate_state`'s payload (every attempt's step submissions, network check excluded); the per-step "current status" cards above it are unchanged, still current-attempt-only, still the surface for editing and Submit validation.
- **Disconnection/Report an Issue no longer asks which step it was for** — the Session Log's ordering already shows that. Removed the required Step picker from `IssuesSection`'s shared modal (both the candidate's Disconnection and staff's own Report an Issue), and `0015_drop_issue_has_a_step.sql` drops the `issue_has_a_step` check constraint that required one. Already-logged issues that do have a step keep showing it; new ones just don't ask.

### Report: candidate-level activity, and fixing a metric the attempt model broke

- **New "Candidate Activity" table** (Email / Steps Filled / Disconnections), between the Activity summary and the Candidate Funnel — Steps Filled counts every step submission across every attempt for that candidate, so someone who disconnected and re-answered steps shows more than the test's step count, not less.
- **Session Timeline dots now lead with the step name** in their hover tooltip (`Session Joined · candidate@email · 6:11 pm`, was `candidate@email · Session Joined · 6:11 pm`) -- it was already there, just not the first thing you'd read.
- **Session Log entries are now clickable**: clicking a step (in either the candidate's own Preview or staff's CandidateForm) expands it to show the comment and evidence actually submitted for *that* attempt -- not just the outcome and time. `0016_session_log_evidence.sql` adds `comment`/`evidence_paths` to `rpc_get_candidate_state`'s `step_report_history`, and `getCandidateStepHistory` (staff) selects the same columns. The evidence rendering (thumbnail + download) was extracted into a shared `src/components/EvidenceRow.tsx`, used by `StepPreview` and now `SessionLog` too, instead of a third copy. **Disconnection entries are clickable too**, expanding to show that disconnection's own comment and evidence right in the log, instead of only being visible by cross-referencing Issues & Disconnections below.
- **Candidates table (`src/routes/admin/Candidates.tsx`, and the moderator's equivalent `src/routes/moderator/Dashboard.tsx`)**: the Email column (and admin's row-select checkbox) is now frozen (`position: sticky`) while the many per-step columns scroll horizontally underneath, so you can always tell whose row you're looking at; every step column now shares a standard width (`w-[110px]`, header text wraps instead of forcing the column wide) instead of sizing to each step's name length; a candidate count (`N candidates`, or `M of N candidates` once the search box or moderator filter narrows the list) sits next to the filter controls; and each step column's header now shows, in parentheses, how many of the currently-displayed (filtered) candidates have a timestamp for that step in their current attempt. Both tables share the same table markup pattern (not a shared component), so this round of fixes touched both files identically.
- **Fixed "Steps Submitted" and "Started Form"**, both of which had gone quietly wrong once attempts existed: they read `step_outcomes`, which is scoped to each candidate's *current* attempt, so a candidate who'd filled in several steps then disconnected would show as having submitted fewer steps than they actually had (their current attempt resets to blank) -- "Started Form" could even flip back to "not started." Both now derive from the full `step_report_history` (every attempt) instead, matching the new Candidate Activity table and the Session Timeline, which already used history correctly. "Completed All Steps" and "Unable to Complete" are left as current-attempt snapshots on purpose -- those are meant to answer "where do things stand right now," not "what happened historically."

### Staff candidate view gets the same Session Log as the candidate's own Preview

The candidate-side Session Log (chronological step submissions across every attempt, plus disconnections) only existed in the candidate's own Preview -- staff (admin/moderator) editing the same candidate saw just the current-attempt step cards, with no way to see the history behind them. Extracted the Session Log into a shared `src/components/SessionLog.tsx` and added it to `src/routes/staff/CandidateForm.tsx` (via a new `getCandidateStepHistory` in `staffApi.ts`, fetching every attempt's step_reports for that one candidate), positioned the same way: after the step cards, before Issues & Disconnections. It updates optimistically on every staff edit, same as the candidate's own view.
