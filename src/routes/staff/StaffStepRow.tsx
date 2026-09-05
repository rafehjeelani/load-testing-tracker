import { useState } from "react";
import type { Outcome } from "../../types";
import { OUTCOME_LABEL, OUTCOME_TEXT_COLOR, formatTime, toTimeInputValue, withTimeInputValue } from "../../lib/outcome";
import { FieldLabel, Textarea } from "../../components/ui";
import EvidenceList from "../../components/EvidenceList";
import { getEvidenceDownloadUrl } from "../../lib/staffApi";

interface Props {
  name: string;
  stepRequired: boolean;
  radioGroup: string;
  initialOutcome: Outcome | null;
  initialComment: string;
  initialEvidencePaths: string[];
  initialSavedAt: string | null;
  onSave: (outcome: Outcome | null, comment: string, evidencePaths: string[], stampSavedAt: boolean) => Promise<void>;
  onUpload: (file: File) => Promise<string>;
  onEditSavedAt: (savedAtIso: string) => Promise<void>;
}

export default function StaffStepRow({
  name,
  stepRequired,
  radioGroup,
  initialOutcome,
  initialComment,
  initialEvidencePaths,
  initialSavedAt,
  onSave,
  onUpload,
  onEditSavedAt,
}: Props) {
  const [outcome, setOutcome] = useState<Outcome | null>(initialOutcome);
  const [comment, setComment] = useState(initialComment);
  const [evidencePaths, setEvidencePaths] = useState<string[]>(initialEvidencePaths);
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  const [editingTime, setEditingTime] = useState(false);
  const [editingTimeValue, setEditingTimeValue] = useState("");
  const commentRequired = outcome === "with_issues" || outcome === "unable";

  async function handleOutcomeChange(next: Outcome) {
    setOutcome(next);
    const now = new Date().toISOString();
    setSavedAt(now);
    await onSave(next, comment, evidencePaths, true);
  }

  async function handleCommentBlur() {
    if (comment === initialComment) return;
    await onSave(outcome, comment, evidencePaths, false);
  }

  async function handleAddEvidence(path: string) {
    const next = [...evidencePaths, path];
    setEvidencePaths(next);
    await onSave(outcome, comment, next, false);
  }

  async function handleRemoveEvidence(path: string) {
    const next = evidencePaths.filter((p) => p !== path);
    setEvidencePaths(next);
    await onSave(outcome, comment, next, false);
  }

  function startEditTime() {
    setEditingTimeValue(toTimeInputValue(savedAt));
    setEditingTime(true);
  }

  async function saveEditTime() {
    const nextIso = withTimeInputValue(savedAt ?? new Date().toISOString(), editingTimeValue);
    setSavedAt(nextIso);
    setEditingTime(false);
    await onEditSavedAt(nextIso);
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
          editingTime ? (
            <span className="flex items-center gap-1.5">
              <input
                type="time"
                value={editingTimeValue}
                onChange={(e) => setEditingTimeValue(e.target.value)}
                className="px-2 py-1 border border-border rounded-[6px] bg-surface text-[12px] font-mono-tabular"
              />
              <button type="button" onClick={saveEditTime} className="text-success cursor-pointer" title="Save time">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setEditingTime(false)}
                className="text-text-3 cursor-pointer text-[13px]"
              >
                ×
              </button>
            </span>
          ) : (
            <div className={`flex items-center gap-1.5 font-mono-tabular text-[11.5px] ${OUTCOME_TEXT_COLOR[outcome]}`}>
              Saved {formatTime(savedAt)}
              <button
                type="button"
                onClick={startEditTime}
                className="text-text-3 hover:text-accent cursor-pointer"
                title="Edit time"
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
            </div>
          )
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
          window.open(await getEvidenceDownloadUrl(path), "_blank");
        }}
        getPreviewUrl={getEvidenceDownloadUrl}
        required
      />
    </div>
  );
}
