import type { Outcome, Step, StepReport } from "../../types";
import { Button } from "../../components/ui";
import { Logo } from "../../components/Logo";
import EvidenceList from "../../components/EvidenceList";
import { formatTime } from "../../lib/outcome";

interface Props {
  step: Step;
  report: StepReport | undefined;
  onSave: (outcome: Outcome | null, comment: string, evidencePaths: string[]) => Promise<{ saved_at: string | null } | void>;
  onUpload: (file: File) => Promise<string>;
  onViewEvidence: (path: string) => Promise<string>;
  onContinue: () => void;
}

/** A fixed, one-time gate every candidate does once, right after the email
 *  gate and before the real step wizard -- not admin-configured, not part
 *  of the ordinary step sequence, and never shown again for the rest of
 *  the candidate's session. Unlike a regular step, there's no outcome to
 *  pick or comment to add -- just proof (one piece of evidence) that the
 *  candidate logged in, so saving always records a fixed "completed"
 *  outcome once that evidence is attached. */
export default function NetworkCheck({ step, report, onSave, onUpload, onViewEvidence, onContinue }: Props) {
  const evidencePaths = report?.evidence_paths ?? [];
  const canContinue = evidencePaths.length > 0;

  async function handleAddEvidence(path: string) {
    await onSave("completed", "", [...evidencePaths, path]);
  }

  async function handleRemoveEvidence(path: string) {
    const next = evidencePaths.filter((p) => p !== path);
    await onSave(next.length > 0 ? "completed" : null, "", next);
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="max-w-[760px] mx-auto px-6 h-[52px] flex items-center gap-2">
          <Logo />
          <span className="font-semibold text-sm">Crowd Test Tracker</span>
        </div>
      </div>

      <div className="max-w-[760px] mx-auto px-6 pt-6 pb-14">
        <h1 className="text-[18px] font-bold mb-1.5">Before you begin</h1>
        <p className="text-[12.5px] text-text-3 mb-5 leading-relaxed">
          Every candidate does a quick network check once, before starting the step-by-step form below.
        </p>

        <div className="bg-surface border border-border rounded-[10px] p-5 mb-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="font-semibold text-sm">{step.name}</div>
            <div className={`font-mono-tabular text-[11.5px] ${report?.saved_at ? "text-success" : "text-text-3"}`}>
              {report?.saved_at ? `Saved ${formatTime(report.saved_at)}` : "Not yet reported"}
            </div>
          </div>
          <EvidenceList
            paths={evidencePaths}
            onAdd={handleAddEvidence}
            onRemove={handleRemoveEvidence}
            onUpload={onUpload}
            onDownload={async (path) => {
              window.open(await onViewEvidence(path), "_blank");
            }}
            getPreviewUrl={onViewEvidence}
            required
            maxFiles={1}
          />
        </div>

        <Button onClick={onContinue} disabled={!canContinue} className="w-full">
          Continue
        </Button>
      </div>
    </div>
  );
}
