import { useRef, useState, type ReactNode } from "react";
import type { Outcome } from "../../types";
import { FieldLabel, Textarea } from "../../components/ui";
import EvidenceList from "../../components/EvidenceList";
import { REFERENCE_SCREENSHOTS } from "../../lib/referenceScreenshots";
import { OUTCOME_LABEL, OUTCOME_TEXT_COLOR, formatTime, toTimeInputValue, withTimeInputValue } from "../../lib/outcome";

interface Props {
  name: string;
  stepRequired: boolean;
  radioGroup: string;
  initialOutcome: Outcome | null;
  initialComment: string;
  initialEvidencePaths: string[];
  initialSavedAt: string | null;
  /** True right after a failed submit if this was the first incomplete
   *  required step -- draws a temporary highlight so the candidate can find
   *  it without hunting through the whole form. */
  highlighted?: boolean;
  /** When provided, replaces the plain step-name text in the heading (e.g.
   *  the wizard's step-picker dropdown) -- the required asterisk still
   *  renders alongside it either way. */
  nameSlot?: ReactNode;
  onSave: (outcome: Outcome | null, comment: string, evidencePaths: string[]) => Promise<{ saved_at: string | null } | void>;
  onUpload: (file: File) => Promise<string>;
  onViewEvidence: (path: string) => Promise<string>;
  onEditSavedAt: (savedAtIso: string) => Promise<void>;
}

export default function StepRow({
  name,
  stepRequired,
  radioGroup,
  initialOutcome,
  initialComment,
  initialEvidencePaths,
  initialSavedAt,
  highlighted,
  nameSlot,
  onSave,
  onUpload,
  onViewEvidence,
  onEditSavedAt,
}: Props) {
  const [outcome, setOutcome] = useState<Outcome | null>(initialOutcome);
  const [comment, setComment] = useState(initialComment);
  const [evidencePaths, setEvidencePaths] = useState<string[]>(initialEvidencePaths);
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  const [editingTime, setEditingTime] = useState(false);
  const [editingTimeValue, setEditingTimeValue] = useState("");
  const commentRequired = outcome === "unable";
  const missingComment = commentRequired && !comment.trim();
  const missingEvidence = outcome !== null && evidencePaths.length === 0;
  const reference = REFERENCE_SCREENSHOTS[name];

  // Several handlers below fire onSave in quick succession (e.g. blurring
  // the comment box the same moment a radio gets unchecked) -- without this,
  // two in-flight saves race and whichever's network response lands last
  // wins, silently reverting whichever change was actually meant to be
  // final. Chaining every save through this ref forces them to run and
  // resolve strictly in the order they were triggered.
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  function enqueueSave<T>(fn: () => Promise<T>): Promise<T> {
    const result = saveQueueRef.current.then(fn, fn);
    saveQueueRef.current = result.catch(() => {});
    return result;
  }

  async function handleOutcomeChange(next: Outcome) {
    setOutcome(next);
    const result = await enqueueSave(() => onSave(next, comment, evidencePaths));
    if (result) setSavedAt(result.saved_at ?? null);
  }

  /** Re-clicking the already-selected radio un-selects it. Native radios
   *  can't be unchecked by clicking themselves again, so this is wired
   *  through onClick (which fires even without a checked-state change)
   *  rather than onChange (which wouldn't fire at all here). */
  async function handleUncheck() {
    const hasOtherData = comment.trim().length > 0 || evidencePaths.length > 0;
    const ok = window.confirm(
      hasOtherData
        ? "Clear your answer for this step? Your comment and evidence will be kept, along with the recorded time."
        : "Clear your answer for this step? The recorded time will be cleared too, since nothing else is saved for this step.",
    );
    if (!ok) return;
    setOutcome(null);
    const result = await enqueueSave(() => onSave(null, comment, evidencePaths));
    if (result) setSavedAt(result.saved_at ?? null);
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

  async function handleCommentBlur() {
    if (comment === initialComment) return;
    await enqueueSave(() => onSave(outcome, comment, evidencePaths));
  }

  async function handleAddEvidence(path: string) {
    const next = [...evidencePaths, path];
    setEvidencePaths(next);
    await enqueueSave(() => onSave(outcome, comment, next));
  }

  async function handleRemoveEvidence(path: string) {
    const next = evidencePaths.filter((p) => p !== path);
    setEvidencePaths(next);
    await enqueueSave(() => onSave(outcome, comment, next));
  }

  return (
    <div
      className={`bg-surface border rounded-[10px] p-5 mb-3 transition-shadow ${
        highlighted ? "border-warning ring-2 ring-warning/40" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="font-semibold text-sm flex items-center gap-1">
          {nameSlot ?? name}
          {stepRequired && (
            <span className="text-danger" title="Required">
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
              onClick={() => {
                if (outcome === key) handleUncheck();
              }}
              onChange={() => handleOutcomeChange(key)}
            />
            {OUTCOME_LABEL[key]}
          </label>
        ))}
      </div>

      {(missingComment || missingEvidence) && (
        <div className="flex items-center gap-1.5 text-[12px] text-warning mb-2.5">
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="shrink-0">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          {missingComment && missingEvidence
            ? "Add a comment and attach evidence to finish this step."
            : missingComment
              ? "Add a comment to finish this step."
              : "Attach evidence to finish this step."}
        </div>
      )}

      {reference && (
        <div className="bg-surface-2 border border-border rounded-[8px] p-3 mb-3">
          <div className="text-[12px] text-text-2 leading-relaxed mb-2">
            <span className="font-semibold text-text">Reference: what to capture</span> — {reference.caption}
          </div>
          <img
            src={reference.src}
            alt={`Example screenshot for ${name}`}
            className="w-full h-auto rounded-[4px] border border-border"
          />
        </div>
      )}

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
