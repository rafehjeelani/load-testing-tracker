import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useCandidateSession } from "./CandidateSessionContext";
import { addIssue, submitForm, upsertStepReport, uploadEvidence } from "../../lib/candidateApi";
import { Badge, Button } from "../../components/ui";
import { Logo } from "../../components/Logo";
import StepRow from "./StepRow";
import IssuesSection from "./IssuesSection";
import type { Outcome } from "../../types";

export default function StepForm() {
  const { testSlug } = useParams<{ testSlug: string }>();
  const { session, setSession } = useCandidateSession();
  const [submitting, setSubmitting] = useState(false);

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
    evidencePath: string | null,
  ) {
    return upsertStepReport(sessionTestSlug, email, stepId, outcome, comment, evidencePath);
  }

  async function handleUpload(file: File) {
    return uploadEvidence(sessionTestSlug, email, file);
  }

  async function handleAddIssue(
    stepId: string | null,
    customStepName: string | null,
    comment: string,
    evidencePath: string,
  ) {
    await addIssue(sessionTestSlug, email, stepId, customStepName, comment, evidencePath);
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
            evidence_path: evidencePath,
            created_at: new Date().toISOString(),
          },
        ],
      },
    });
  }

  async function handleSubmitForm() {
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
      <div className="border-b border-border bg-surface">
        <div className="max-w-[760px] mx-auto px-6 h-[52px] flex items-center gap-2">
          <Logo />
          <span className="font-semibold text-sm">Load Testing Tracker</span>
        </div>
      </div>

      <div className="max-w-[760px] mx-auto px-6 pt-7 pb-14">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div>
            <div className="font-semibold text-[15px]">{email}</div>
            <div className="text-[12.5px] text-text-2 mt-0.5">{state.test.name}</div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Saved
          </span>
        </div>

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
              stepId={step.id}
              name={step.name}
              radioGroup={`step-${step.id}`}
              initialOutcome={report?.outcome ?? null}
              initialComment={report?.comment ?? ""}
              initialEvidencePath={report?.evidence_path ?? null}
              initialSavedAt={report?.saved_at ?? null}
              onSave={(outcome, comment, evidencePath) =>
                handleSaveStep(step.id, outcome, comment, evidencePath)
              }
              onUpload={handleUpload}
            />
          );
        })}

        <IssuesSection
          steps={sortedSteps}
          issues={state.issues}
          onAdd={handleAddIssue}
          onUpload={handleUpload}
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
          <Button onClick={handleSubmitForm} disabled={submitting} className="min-w-[220px]">
            {state.candidate.submitted ? "Resubmit Form" : "Submit Form"}
          </Button>
        </div>
      </div>
    </div>
  );
}
