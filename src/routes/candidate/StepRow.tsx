import { useState } from "react";
import type { Outcome } from "../../types";
import { FieldLabel, Textarea } from "../../components/ui";
import EvidenceList from "../../components/EvidenceList";
import { OUTCOME_LABEL, OUTCOME_TEXT_COLOR, formatTime } from "../../lib/outcome";

interface Props {
  name: string;
  stepRequired: boolean;
  radioGroup: string;
  initialOutcome: Outcome | null;
  initialComment: string;
  initialEvidencePaths: string[];
  initialSavedAt: string | null;
  onSave: (outcome: Outcome | null, comment: string, evidencePaths: string[]) => Promise<{ saved_at: string | null } | void>;
  onUpload: (file: File) => Promise<string>;
  onViewEvidence: (path: string) => Promise<string>;
}

export default function StepRow({
  name,
  stepRequired,
  radioGroup,
  initialOutcome,
  initialComment,
  initialEvidencePaths,
  initialSavedAt,
  onSave,
  onUpload,
  onViewEvidence,
}: Props) {
  const [outcome, setOutcome] = useState<Outcome | null>(initialOutcome);
  const [comment, setComment] = useState(initialComment);
  const [evidencePaths, setEvidencePaths] = useState<string[]>(initialEvidencePaths);
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  const commentRequired = outcome === "with_issues" || outcome === "unable";

  async function handleOutcomeChange(next: Outcome) {
    setOutcome(next);
    const result = await onSave(next, comment, evidencePaths);
    if (result?.saved_at) setSavedAt(result.saved_at);
  }

  async function handleCommentBlur() {
    if (comment === initialComment) return;
    await onSave(outcome, comment, evidencePaths);
  }

  async function handleAddEvidence(path: string) {
    const next = [...evidencePaths, path];
    setEvidencePaths(next);
    await onSave(outcome, comment, next);
  }

  async function handleRemoveEvidence(path: string) {
    const next = evidencePaths.filter((p) => p !== path);
    setEvidencePaths(next);
    await onSave(outcome, comment, next);
  }

  return (
    <div className="bg-surface border border-border rounded-[10px] p-5 mb-3">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="font-semibold text-sm">
          {name}
          {stepRequired && (
            <span className="text-danger" title="Required">
              {" "}
              *
            </span>
          )}
        </div>
        {outcome ? (
          <div className={`font-mono-tabular text-[11.5px] ${OUTCOME_TEXT_COLOR[outcome]}`}>
            Saved {formatTime(savedAt)}
          </div>
        ) : (
          <div className="font-mono-tabular text-[11.5px] text-text-3">Not yet reported</div>
        )}
      </div>

      <div className="flex gap-4.5 mb-3 flex-wrap">
        {(Object.keys(OUTCOME_LABEL) as Outcome[]).map((key) => (
          <label key={key} className="flex items-center gap-1.5 text-[13px] cursor-pointer">
            <input
              type="radio"
              name={radioGroup}
              checked={outcome === key}
              onChange={() => handleOutcomeChange(key)}
            />
            {OUTCOME_LABEL[key]}
          </label>
        ))}
      </div>

      <FieldLabel required={commentRequired}>Comment</FieldLabel>
      <Textarea
        placeholder={commentRequired ? "Describe what happened" : "Add a comment (optional)"}
        required={commentRequired}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={handleCommentBlur}
        className="min-h-[56px] mb-2"
      />

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
      />
    </div>
  );
}
