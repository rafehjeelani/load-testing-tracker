import { useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useCandidateSession } from "./CandidateSessionContext";
import {
  addIssue,
  editIssueCreatedAt,
  editStepSavedAt,
  getEvidenceViewUrl,
  submitForm,
  upsertStepReport,
  uploadEvidence,
} from "../../lib/candidateApi";
import { Button, PageHeader } from "../../components/ui";
import { Logo } from "../../components/Logo";
import StepRow from "./StepRow";
import StepPreview from "./StepPreview";
import NetworkCheck from "./NetworkCheck";
import IssuesSection, { type IssuesSectionHandle } from "../../components/IssuesSection";
import type { Outcome, Step, StepReportHistoryEntry } from "../../types";

type ViewMode = "wizard" | "preview";

/** Upserts one entry by (step_id, attempt) -- a step can be resaved several
 *  times within the same attempt (edits, re-checking an outcome), and that's
 *  still one entry in the Session Log, not a new one each time. */
function upsertHistoryEntry(
  history: StepReportHistoryEntry[],
  entry: StepReportHistoryEntry,
): StepReportHistoryEntry[] {
  const idx = history.findIndex((r) => r.step_id === entry.step_id && r.attempt === entry.attempt);
  if (idx === -1) return [...history, entry];
  return history.map((r, i) => (i === idx ? entry : r));
}

export default function StepForm() {
  const { testSlug } = useParams<{ testSlug: string }>();
  const { session, setSession } = useCandidateSession();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [nudgeStepId, setNudgeStepId] = useState<string | null>(null);
  const [skippedStepNames, setSkippedStepNames] = useState<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("wizard");
  const issuesRef = useRef<IssuesSectionHandle>(null);

  // The network check is a fixed step flagged is_network_check -- it's
  // excluded from the regular wizard/dropdown/preview list below.
  // pastNetworkCheck initializes true when the candidate already has a
  // recorded outcome for it (from *any* prior page load, since this reads
  // real persisted state) -- that's what makes it "once ever," not just
  // "once per render," and correctly keeps it from reappearing after a
  // disconnection restart (which never touches this flag).
  const networkCheckStep = session?.state.steps.find((s) => s.is_network_check);
  const networkCheckReport = networkCheckStep
    ? session?.state.step_reports.find((r) => r.step_id === networkCheckStep.id)
    : undefined;
  const [pastNetworkCheck, setPastNetworkCheck] = useState(() => !!networkCheckReport?.outcome);

  if (!session || session.testSlug !== testSlug) {
    // No live session for this test (fresh load, refresh, or a different
    // test link) -- send them back through the email gate on purpose.
    return <Navigate to={`/t/${testSlug}`} replace />;
  }

  const { state, email, testSlug: sessionTestSlug } = session;

  async function handleSaveStep(
    stepId: string,
    outcome: Outcome | null,
    comment: string,
    evidencePaths: string[],
  ) {
    const result = await upsertStepReport(sessionTestSlug, email, stepId, outcome, comment, evidencePaths);
    // Keep session.state.step_reports in sync with every save -- otherwise
    // it stays frozen at whatever loaded on page-open, and the submit-time
    // validation below (missing evidence/comment) silently checks stale
    // data instead of what the candidate just entered.
    //
    // result.saved_at can legitimately be null (the RPC clears it when an
    // outcome is unchecked with nothing else attached), so this only falls
    // back to the previous value when result itself is absent -- `??` alone
    // would treat that real null the same as "no result" and resurrect a
    // stale timestamp.
    const existing = state.step_reports.find((r) => r.step_id === stepId);
    const nextSavedAt = result ? result.saved_at ?? null : existing?.saved_at ?? null;
    const updatedReports = [
      ...state.step_reports.filter((r) => r.step_id !== stepId),
      {
        step_id: stepId,
        outcome,
        comment,
        evidence_paths: evidencePaths,
        saved_at: nextSavedAt,
        attempt: state.candidate.current_attempt,
      },
    ];
    // Keep the Session Log's history in sync too -- upserted by (step, attempt)
    // since a step can be resaved several times within the same attempt (that's
    // still one entry in the log), but the network check isn't part of the
    // ordinary step sequence so it's excluded here just like everywhere else.
    const updatedHistory =
      networkCheckStep?.id === stepId
        ? state.step_report_history
        : upsertHistoryEntry(state.step_report_history, {
            step_id: stepId,
            outcome,
            comment,
            evidence_paths: evidencePaths,
            saved_at: nextSavedAt,
            attempt: state.candidate.current_attempt,
          });
    setSession({
      testSlug: sessionTestSlug,
      email,
      state: { ...state, step_reports: updatedReports, step_report_history: updatedHistory },
    });
    return result;
  }

  async function handleEditSavedAt(stepId: string, savedAtIso: string) {
    await editStepSavedAt(sessionTestSlug, email, stepId, savedAtIso);
    setSession({
      testSlug: sessionTestSlug,
      email,
      state: {
        ...state,
        step_reports: state.step_reports.map((r) => (r.step_id === stepId ? { ...r, saved_at: savedAtIso } : r)),
        step_report_history:
          networkCheckStep?.id === stepId
            ? state.step_report_history
            : upsertHistoryEntry(state.step_report_history, {
                step_id: stepId,
                outcome: state.step_reports.find((r) => r.step_id === stepId)?.outcome ?? null,
                comment: state.step_reports.find((r) => r.step_id === stepId)?.comment ?? null,
                evidence_paths: state.step_reports.find((r) => r.step_id === stepId)?.evidence_paths ?? [],
                saved_at: savedAtIso,
                attempt: state.candidate.current_attempt,
              }),
      },
    });
  }

  async function handleUpload(file: File) {
    return uploadEvidence(sessionTestSlug, email, file);
  }

  async function handleViewEvidence(path: string) {
    return getEvidenceViewUrl(path);
  }

  async function handleAddIssue(
    stepId: string | null,
    customStepName: string | null,
    comment: string,
    evidencePaths: string[],
  ) {
    await addIssue(sessionTestSlug, email, stepId, customStepName, comment, evidencePaths);
    setSession({
      testSlug: sessionTestSlug,
      email,
      state: {
        ...state,
        issues: [
          ...state.issues,
          {
            id: crypto.randomUUID(),
            step_id: stepId,
            custom_step_name: customStepName,
            comment,
            evidence_paths: evidencePaths,
            created_at: new Date().toISOString(),
          },
        ],
        // Logging a disconnection starts a fresh attempt server-side -- the
        // old answers aren't deleted (they stay in the database, and feed
        // the Report's Session Timeline), but this session should stop
        // showing them: every step reappears as "not yet reported," and the
        // next save for it becomes a new, separately-timestamped row. The
        // network check's report is kept, since it's exempt from attempts.
        step_reports: state.step_reports.filter((r) => r.step_id === networkCheckStep?.id),
        candidate: { ...state.candidate, current_attempt: state.candidate.current_attempt + 1 },
      },
    });
    // A disconnection restarts the candidate at Step 1 -- their already-saved
    // answers for every step are untouched, only where they're looking
    // resets. The network check is not repeated (pastNetworkCheck is a
    // separate flag this never touches).
    setCurrentStepIndex(0);
    setViewMode("wizard");
    setNudgeStepId(null);
    setSkippedStepNames([]);
  }

  async function handleEditIssueTime(issueId: string, createdAtIso: string) {
    await editIssueCreatedAt(sessionTestSlug, email, issueId, createdAtIso);
    setSession({
      testSlug: sessionTestSlug,
      email,
      state: {
        ...state,
        issues: state.issues.map((i) => (i.id === issueId ? { ...i, created_at: createdAtIso } : i)),
      },
    });
  }

  function stepMissingEvidence(step: Step): boolean {
    const r = reportByStep.get(step.id);
    return !!(r?.outcome && r.evidence_paths.length === 0);
  }

  function stepMissingComment(step: Step): boolean {
    const r = reportByStep.get(step.id);
    return r?.outcome === "unable" && !r.comment?.trim();
  }

  function missingEvidenceSteps(): string[] {
    return sortedSteps.filter(stepMissingEvidence).map((s) => s.name);
  }

  function missingCommentSteps(): string[] {
    return sortedSteps.filter(stepMissingComment).map((s) => s.name);
  }

  /** Shared navigation for Next, the step dropdown, and jumping in from
   *  Preview -- also where the "you skipped a step" nudge is computed,
   *  since with a wizard, skipping can only ever happen by navigating past
   *  an untouched earlier step (there's no single page left to save into). */
  function goToStep(index: number) {
    const skipped = sortedSteps.slice(0, index).filter((s) => !reportByStep.get(s.id)?.outcome);
    setSkippedStepNames(skipped.map((s) => s.name));
    setCurrentStepIndex(index);
    setViewMode("wizard");
  }

  async function handleSubmitForm() {
    const missingEvidence = missingEvidenceSteps();
    const missingComment = missingCommentSteps();
    if (missingEvidence.length > 0 || missingComment.length > 0) {
      const parts: string[] = [];
      if (missingEvidence.length > 0) {
        parts.push(`attach at least one piece of evidence for: ${missingEvidence.join(", ")}`);
      }
      if (missingComment.length > 0) {
        parts.push(`add a comment explaining what happened for: ${missingComment.join(", ")}`);
      }
      setSubmitError(`Please ${parts.join("; and ")}.`);
      const firstIncomplete = sortedSteps.find((s) => stepMissingEvidence(s) || stepMissingComment(s));
      if (firstIncomplete) {
        const index = sortedSteps.findIndex((s) => s.id === firstIncomplete.id);
        setCurrentStepIndex(index);
        setViewMode("wizard");
        setNudgeStepId(firstIncomplete.id);
        setTimeout(() => setNudgeStepId((id) => (id === firstIncomplete.id ? null : id)), 2500);
      }
      return;
    }
    setSubmitError(null);
    setNudgeStepId(null);
    setSubmitting(true);
    try {
      await submitForm(sessionTestSlug, email);
      setSession({
        testSlug: sessionTestSlug,
        email,
        state: {
          ...state,
          candidate: { ...state.candidate, submitted: true, submitted_at: new Date().toISOString() },
        },
      });
    } finally {
      setSubmitting(false);
    }
  }

  const sortedSteps = [...state.steps].filter((s) => !s.is_network_check).sort((a, b) => a.order_index - b.order_index);
  const reportByStep = new Map(state.step_reports.map((r) => [r.step_id, r]));

  // The network check gate: shown until the candidate explicitly continues
  // past it, which only ever happens once (pastNetworkCheck sticks for the
  // rest of the session, including across disconnection restarts).
  if (networkCheckStep && !pastNetworkCheck) {
    return (
      <NetworkCheck
        step={networkCheckStep}
        report={networkCheckReport}
        onSave={(outcome, comment, evidencePaths) => handleSaveStep(networkCheckStep.id, outcome, comment, evidencePaths)}
        onUpload={handleUpload}
        onViewEvidence={handleViewEvidence}
        onEditSavedAt={(savedAtIso) => handleEditSavedAt(networkCheckStep.id, savedAtIso)}
        onContinue={() => setPastNetworkCheck(true)}
      />
    );
  }

  const currentStep = sortedSteps[currentStepIndex];
  const isLastStep = currentStepIndex === sortedSteps.length - 1;
  const currentOutcome = currentStep ? reportByStep.get(currentStep.id)?.outcome : null;

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="max-w-[760px] mx-auto px-6 h-[52px] flex items-center gap-2">
          <Logo />
          <span className="font-semibold text-sm">Crowd Test Tracker</span>
        </div>
      </div>

      <PageHeader maxWidthClassName="max-w-[760px]" paddingClassName="px-6 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-[15px]">{email}</div>
            <div className="text-[12.5px] text-text-2 mt-0.5">{state.test.name}</div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-[12px] text-success">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              Saved
            </span>
            <Button
              variant="secondary"
              onClick={() => setViewMode(viewMode === "preview" ? "wizard" : "preview")}
              className="flex items-center gap-1.5 whitespace-nowrap"
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {viewMode === "preview" ? "Back to Steps" : "Preview"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => issuesRef.current?.open()}
              className="flex items-center gap-1.5 whitespace-nowrap"
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18.36 5.64a9 9 0 11-12.73 0" />
                <path d="M12 2v6" />
              </svg>
              Disconnection
            </Button>
          </div>
        </div>
      </PageHeader>

      <div className="max-w-[760px] mx-auto px-6 pt-5 pb-14">
        {skippedStepNames.length > 0 && (
          <div className="flex items-start gap-2 bg-warning-soft border border-warning-border rounded-[10px] px-4 py-3 mb-4 text-[12.5px] text-warning">
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="shrink-0 mt-0.5">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span className="flex-1">
              Looks like you skipped {skippedStepNames.length === 1 ? "a step" : "some steps"} — you can
              still go back and report on: {skippedStepNames.join(", ")}.
            </span>
            <button
              type="button"
              onClick={() => setSkippedStepNames([])}
              className="text-warning cursor-pointer text-[14px] leading-none shrink-0"
            >
              ×
            </button>
          </div>
        )}

        {viewMode === "wizard" && currentStep ? (
          <>
            <p className="text-[12.5px] text-text-3 mb-4 leading-relaxed">
              Mark how this step actually went below. Your answers save automatically as you type —
              the timestamp is stamped the moment you pick an option. Evidence is required for every
              step.
            </p>

            <StepRow
              // The attempt is folded into the key alongside the step id so a
              // disconnection forces a remount even when currentStepIndex was
              // already 0 -- otherwise StepRow (whose state only reads its
              // initial* props once, on mount) would keep showing the prior
              // attempt's now-superseded answer instead of resetting to blank.
              key={`${currentStep.id}-${state.candidate.current_attempt}`}
              name={currentStep.name}
              stepRequired={currentStep.required}
              radioGroup={`step-${currentStep.id}`}
              initialOutcome={reportByStep.get(currentStep.id)?.outcome ?? null}
              initialComment={reportByStep.get(currentStep.id)?.comment ?? ""}
              initialEvidencePaths={reportByStep.get(currentStep.id)?.evidence_paths ?? []}
              initialSavedAt={reportByStep.get(currentStep.id)?.saved_at ?? null}
              highlighted={nudgeStepId === currentStep.id}
              nameSlot={
                <span className="flex items-center gap-2 flex-wrap">
                  <select
                    value={currentStepIndex}
                    onChange={(e) => goToStep(Number(e.target.value))}
                    className="font-semibold text-sm bg-transparent border-none focus:outline-none cursor-pointer -ml-1"
                  >
                    {sortedSteps.map((s, i) => (
                      <option key={s.id} value={i}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <span className="font-mono-tabular text-[11px] font-normal text-text-3 shrink-0">
                    Step {currentStepIndex + 1} of {sortedSteps.length}
                  </span>
                </span>
              }
              onSave={(outcome, comment, evidencePaths) => handleSaveStep(currentStep.id, outcome, comment, evidencePaths)}
              onUpload={handleUpload}
              onViewEvidence={handleViewEvidence}
              onEditSavedAt={(savedAtIso) => handleEditSavedAt(currentStep.id, savedAtIso)}
            />

            <div className="flex items-center gap-2">
              {currentStepIndex > 0 && (
                <Button variant="ghost" onClick={() => goToStep(currentStepIndex - 1)}>
                  ← Back
                </Button>
              )}
              <Button
                onClick={() => (isLastStep ? setViewMode("preview") : goToStep(currentStepIndex + 1))}
                disabled={!currentOutcome}
                className="flex-1"
              >
                {isLastStep ? "Review & Submit" : "Next"}
              </Button>
            </div>
            {!currentOutcome && (
              <div className="text-[12px] text-text-3 mt-1.5">Pick an outcome above to continue.</div>
            )}
          </>
        ) : (
          <StepPreview
            steps={sortedSteps}
            reportByStep={reportByStep}
            history={state.step_report_history}
            issues={state.issues}
            onEditStep={goToStep}
            onDownloadEvidence={async (path) => {
              window.open(await handleViewEvidence(path), "_blank");
            }}
            getPreviewUrl={handleViewEvidence}
            submitted={state.candidate.submitted}
            submitting={submitting}
            submitError={submitError}
            onSubmit={handleSubmitForm}
          />
        )}

        <IssuesSection
          ref={issuesRef}
          steps={sortedSteps}
          issues={state.issues}
          onAdd={handleAddIssue}
          onUpload={handleUpload}
          onDownload={async (path) => {
            window.open(await handleViewEvidence(path), "_blank");
          }}
          getPreviewUrl={handleViewEvidence}
          onEditTime={handleEditIssueTime}
          hideList={viewMode !== "preview"}
        />

        <div className="text-[12px] text-text-3 text-center mt-2">
          Your answers save automatically as you go. You can close this tab and come back anytime.
        </div>
      </div>
    </div>
  );
}
