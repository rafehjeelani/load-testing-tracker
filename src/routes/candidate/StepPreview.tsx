import type { Issue, Step, StepReport, StepReportHistoryEntry } from "../../types";
import { Badge, Button } from "../../components/ui";
import EvidenceRow from "../../components/EvidenceRow";
import SessionLog from "../../components/SessionLog";
import { OUTCOME_LABEL, OUTCOME_TEXT_COLOR, formatTime } from "../../lib/outcome";

interface Props {
  steps: Step[];
  reportByStep: Map<string, StepReport>;
  /** Every step submission across every attempt (not just the current one),
   *  plus every disconnection -- combined and sorted by time for the
   *  Session Log below. */
  history: StepReportHistoryEntry[];
  issues: Issue[];
  onEditStep: (stepIndex: number) => void;
  onDownloadEvidence: (path: string) => void;
  getPreviewUrl: (path: string) => Promise<string>;
  submitted: boolean;
  submitting: boolean;
  submitError: string | null;
  onSubmit: () => void;
}

/** Read-only summary of every step's current answer, plus the Submit Form
 *  action -- the "view everything at once" counterpart to the step-by-step
 *  wizard. Clicking a step jumps back into the wizard at that step to edit
 *  it, rather than duplicating an editable surface here. */
export default function StepPreview({
  steps,
  reportByStep,
  history,
  issues,
  onEditStep,
  onDownloadEvidence,
  getPreviewUrl,
  submitted,
  submitting,
  submitError,
  onSubmit,
}: Props) {
  return (
    <div>
      {steps.map((step, index) => {
        const r = reportByStep.get(step.id);
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onEditStep(index)}
            className="w-full text-left bg-surface border border-border rounded-[10px] p-5 mb-3 cursor-pointer hover:border-accent"
          >
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <div className="font-semibold text-sm">
                {step.name}
                {step.required && (
                  <span className="text-danger" title="Required">
                    {" "}
                    *
                  </span>
                )}
              </div>
              {r?.outcome ? (
                <div className={`flex items-center gap-1.5 font-mono-tabular text-[11.5px] ${OUTCOME_TEXT_COLOR[r.outcome]}`}>
                  {OUTCOME_LABEL[r.outcome]} · {formatTime(r.saved_at)}
                </div>
              ) : (
                <div className="font-mono-tabular text-[11.5px] text-text-3">Not yet reported</div>
              )}
            </div>
            {r?.comment && <div className="text-[13px] text-text-2 mb-2">{r.comment}</div>}
            {r?.evidence_paths && r.evidence_paths.length > 0 && (
              <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                {r.evidence_paths.map((path) => (
                  <EvidenceRow key={path} path={path} onDownload={onDownloadEvidence} getPreviewUrl={getPreviewUrl} />
                ))}
              </div>
            )}
          </button>
        );
      })}

      <SessionLog
        steps={steps}
        history={history}
        issues={issues}
        onDownloadEvidence={onDownloadEvidence}
        getPreviewUrl={getPreviewUrl}
      />

      <div className="bg-surface border border-border rounded-[10px] p-5.5 mt-5 text-center">
        <Badge variant={submitted ? "success" : "neutral"}>{submitted ? "Submitted" : "Not Submitted"}</Badge>
        <div className="text-[13px] text-text-2 max-w-[440px] mx-auto my-4 leading-relaxed">
          Submitting lets the test team know you're done reporting. You can still edit your answers and
          resubmit afterward — this just marks where things stand right now.
        </div>
        {submitError && <div className="text-[12.5px] text-danger mb-3 max-w-[440px] mx-auto">{submitError}</div>}
        <Button onClick={onSubmit} disabled={submitting} className="min-w-[220px]">
          {submitted ? "Resubmit Form" : "Submit Form"}
        </Button>
      </div>
    </div>
  );
}
