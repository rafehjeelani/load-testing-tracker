import { useEffect, useState } from "react";
import type { Issue, Step, StepReport, StepReportHistoryEntry } from "../../types";
import { Badge, Button } from "../../components/ui";
import { OUTCOME_LABEL, OUTCOME_TEXT_COLOR, formatTime } from "../../lib/outcome";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);
function isImagePath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.has(ext);
}

function EvidenceRow({
  path,
  onDownload,
  getPreviewUrl,
}: {
  path: string;
  onDownload: (path: string) => void;
  getPreviewUrl: (path: string) => Promise<string>;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImagePath(path)) return;
    let cancelled = false;
    getPreviewUrl(path).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return (
    <div className="flex items-center justify-between gap-2 text-[12px] text-text-2">
      <span className="flex items-center gap-1.5 min-w-0">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="w-6 h-6 rounded-[4px] object-cover shrink-0 border border-border" />
        ) : (
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="shrink-0">
            <path d="M12 3v13" />
            <path d="M7 8l5-5 5 5" />
            <path d="M5 21h14" />
          </svg>
        )}
        <span className="truncate">{path.split("/").pop()}</span>
      </span>
      <button
        type="button"
        onClick={() => onDownload(path)}
        className="flex items-center gap-1.5 text-accent font-semibold cursor-pointer shrink-0"
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 3v13" />
          <path d="M17 11l-5 5-5-5" />
          <path d="M5 21h14" />
        </svg>
        Download
      </button>
    </div>
  );
}

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

type LogEntry =
  | { kind: "step"; time: number; stepName: string; outcome: NonNullable<StepReportHistoryEntry["outcome"]> }
  | { kind: "disconnection"; time: number };

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
  const logEntries: LogEntry[] = [
    ...history
      .filter((h): h is StepReportHistoryEntry & { saved_at: string; outcome: NonNullable<StepReportHistoryEntry["outcome"]> } =>
        !!h.saved_at && !!h.outcome,
      )
      .map((h) => ({
        kind: "step" as const,
        time: new Date(h.saved_at).getTime(),
        stepName: steps.find((s) => s.id === h.step_id)?.name ?? "Step",
        outcome: h.outcome,
      })),
    ...issues.map((i) => ({ kind: "disconnection" as const, time: new Date(i.created_at).getTime() })),
  ].sort((a, b) => a.time - b.time);

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

      {logEntries.length > 0 && (
        <div className="bg-surface border border-border rounded-[10px] p-5 mt-5">
          <div className="font-bold text-[15px] mb-1">Session Log</div>
          <div className="text-[12.5px] text-text-3 mb-3.5">
            Every step submission and disconnection, in the order they happened — if a step appears
            twice, a disconnection came in between.
          </div>
          <div className="flex flex-col gap-2">
            {logEntries.map((entry, i) =>
              entry.kind === "disconnection" ? (
                <div key={i} className="flex items-center gap-2 text-[12.5px]">
                  <span
                    className="w-2 h-2 shrink-0 bg-warning"
                    style={{ transform: "rotate(45deg)" }}
                  />
                  <span className="font-semibold text-warning">Disconnection logged</span>
                  <span className="font-mono-tabular text-text-3">· {formatTime(new Date(entry.time).toISOString())}</span>
                </div>
              ) : (
                <div key={i} className="flex items-center gap-2 text-[12.5px]">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${entry.outcome === "unable" ? "bg-danger" : "bg-success"}`} />
                  <span className="font-semibold">{entry.stepName}</span>
                  <span className={OUTCOME_TEXT_COLOR[entry.outcome]}>{OUTCOME_LABEL[entry.outcome]}</span>
                  <span className="font-mono-tabular text-text-3">· {formatTime(new Date(entry.time).toISOString())}</span>
                </div>
              ),
            )}
          </div>
        </div>
      )}

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
