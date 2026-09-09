import { useEffect, useState } from "react";
import type { Step, StepReport } from "../../types";
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
