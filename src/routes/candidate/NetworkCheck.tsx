import type { Outcome, Step, StepReport } from "../../types";
import { Button } from "../../components/ui";
import { Logo } from "../../components/Logo";
import StepRow from "./StepRow";

interface Props {
  step: Step;
  report: StepReport | undefined;
  onSave: (outcome: Outcome | null, comment: string, evidencePaths: string[]) => Promise<{ saved_at: string | null } | void>;
  onUpload: (file: File) => Promise<string>;
  onViewEvidence: (path: string) => Promise<string>;
  onEditSavedAt: (savedAtIso: string) => Promise<void>;
  onContinue: () => void;
}

/** A fixed, one-time gate every candidate does once, right after the email
 *  gate and before the real step wizard -- not admin-configured, and never
 *  shown again for the rest of the candidate's session (including after a
 *  disconnection restart, which only resets the wizard's position). Reuses
 *  StepRow verbatim, so evidence/comment/timestamp behavior is identical to
 *  any other step. */
export default function NetworkCheck({ step, report, onSave, onUpload, onViewEvidence, onEditSavedAt, onContinue }: Props) {
  const commentOk = report?.outcome !== "unable" || !!report?.comment?.trim();
  const canContinue = !!report?.outcome && (report?.evidence_paths.length ?? 0) > 0 && commentOk;

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

        <StepRow
          key={step.id}
          name={step.name}
          stepRequired={step.required}
          radioGroup="network-check"
          initialOutcome={report?.outcome ?? null}
          initialComment={report?.comment ?? ""}
          initialEvidencePaths={report?.evidence_paths ?? []}
          initialSavedAt={report?.saved_at ?? null}
          onSave={onSave}
          onUpload={onUpload}
          onViewEvidence={onViewEvidence}
          onEditSavedAt={onEditSavedAt}
        />

        <Button onClick={onContinue} disabled={!canContinue} className="w-full">
          Continue
        </Button>
      </div>
    </div>
  );
}
