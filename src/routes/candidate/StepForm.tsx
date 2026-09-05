import { useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useCandidateSession } from "./CandidateSessionContext";
import { addIssue, getEvidenceViewUrl, submitForm, upsertStepReport, uploadEvidence } from "../../lib/candidateApi";
import { Badge, Button, PageHeader } from "../../components/ui";
import { Logo } from "../../components/Logo";
import StepRow from "./StepRow";
import IssuesSection, { type IssuesSectionHandle } from "../../components/IssuesSection";
import type { Outcome } from "../../types";

export default function StepForm() {
  const { testSlug } = useParams<{ testSlug: string }>();
  const { session, setSession } = useCandidateSession();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const issuesRef = useRef<IssuesSectionHandle>(null);

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
    const existing = state.step_reports.find((r) => r.step_id === stepId);
    setSession({
      testSlug: sessionTestSlug,
      email,
      state: {
        ...state,
        step_reports: [
          ...state.step_reports.filter((r) => r.step_id !== stepId),
          {
            step_id: stepId,
            outcome,
            comment,
            evidence_paths: evidencePaths,
            saved_at: result?.saved_at ?? existing?.saved_at ?? null,
          },
        ],
      },
    });
    return result;
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
      },
    });
  }

  function missingEvidenceSteps(): string[] {
    return sortedSteps
      .filter((s) => {
        const r = reportByStep.get(s.id);
        return r?.outcome && r.evidence_paths.length === 0;
      })
      .map((s) => s.name);
  }

  function missingCommentSteps(): string[] {
    return sortedSteps
      .filter((s) => {
        const r = reportByStep.get(s.id);
        return (r?.outcome === "with_issues" || r?.outcome === "unable") && !r.comment?.trim();
      })
      .map((s) => s.name);
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
      return;
    }
    setSubmitError(null);
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

  const sortedSteps = [...state.steps].sort((a, b) => a.order_index - b.order_index);
  const reportByStep = new Map(state.step_reports.map((r) => [r.step_id, r]));

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="max-w-[760px] mx-auto px-6 h-[52px] flex items-center gap-2">
          <Logo />
          <span className="font-semibold text-sm">Load Testing Tracker</span>
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
              onClick={() => issuesRef.current?.open()}
              className="flex items-center gap-1.5 whitespace-nowrap"
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Issue / Disconnection
            </Button>
          </div>
        </div>
      </PageHeader>

      <div className="max-w-[760px] mx-auto px-6 pt-5 pb-14">
        <p className="text-[12.5px] text-text-3 mb-4 leading-relaxed">
          While you take the test in the other tab, mark how each step actually went below. Your
          answers save automatically as you type — the timestamp on each step is stamped the
          moment you pick an option, but you can keep editing the comment and evidence anytime.
          Evidence is required for every step.
        </p>

        {sortedSteps.map((step) => {
          const report = reportByStep.get(step.id);
          return (
            <StepRow
              key={step.id}
              name={step.name}
              stepRequired={step.required}
              radioGroup={`step-${step.id}`}
              initialOutcome={report?.outcome ?? null}
              initialComment={report?.comment ?? ""}
              initialEvidencePaths={report?.evidence_paths ?? []}
              initialSavedAt={report?.saved_at ?? null}
              onSave={(outcome, comment, evidencePaths) =>
                handleSaveStep(step.id, outcome, comment, evidencePaths)
              }
              onUpload={handleUpload}
              onViewEvidence={handleViewEvidence}
            />
          );
        })}

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
        />

        <div className="text-[12px] text-text-3 text-center mt-2">
          Your answers save automatically as you go. You can close this tab and come back anytime.
        </div>

        <div className="bg-surface border border-border rounded-[10px] p-5.5 mt-5 text-center">
          <Badge variant={state.candidate.submitted ? "success" : "neutral"}>
            {state.candidate.submitted ? "Submitted" : "Not Submitted"}
          </Badge>
          <div className="text-[13px] text-text-2 max-w-[440px] mx-auto my-4 leading-relaxed">
            Submitting lets the test team know you're done reporting. You can still edit your
            answers and resubmit afterward — this just marks where things stand right now.
          </div>
          {submitError && <div className="text-[12.5px] text-danger mb-3 max-w-[440px] mx-auto">{submitError}</div>}
          <Button onClick={handleSubmitForm} disabled={submitting} className="min-w-[220px]">
            {state.candidate.submitted ? "Resubmit Form" : "Submit Form"}
          </Button>
        </div>
      </div>
    </div>
  );
}
