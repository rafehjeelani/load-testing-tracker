import { useRef, useState } from "react";
import type { Outcome } from "../../types";
import { Textarea } from "../../components/ui";

const OUTCOME_LABEL: Record<Outcome, string> = {
  without_issues: "Completed without issues",
  with_issues: "Completed with issues",
  unable: "Was not able to complete",
};

const OUTCOME_COLOR: Record<Outcome, string> = {
  without_issues: "text-success",
  with_issues: "text-warning",
  unable: "text-danger",
};

interface Props {
  stepId: string;
  name: string;
  radioGroup: string;
  initialOutcome: Outcome | null;
  initialComment: string;
  initialEvidencePath: string | null;
  initialSavedAt: string | null;
  onSave: (outcome: Outcome | null, comment: string, evidencePath: string | null) => Promise<{ saved_at: string | null } | void>;
  onUpload: (file: File) => Promise<string>;
}

export default function StepRow({
  name,
  radioGroup,
  initialOutcome,
  initialComment,
  initialEvidencePath,
  initialSavedAt,
  onSave,
  onUpload,
}: Props) {
  const [outcome, setOutcome] = useState<Outcome | null>(initialOutcome);
  const [comment, setComment] = useState(initialComment);
  const [evidencePath, setEvidencePath] = useState<string | null>(initialEvidencePath);
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleOutcomeChange(next: Outcome) {
    setOutcome(next);
    const result = await onSave(next, comment, evidencePath);
    if (result?.saved_at) setSavedAt(result.saved_at);
  }

  async function handleCommentBlur() {
    if (comment === initialComment) return;
    await onSave(outcome, comment, evidencePath);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = await onUpload(file);
      setEvidencePath(path);
      await onSave(outcome, comment, path);
    } finally {
      setUploading(false);
    }
  }

  const evidenceFilename = evidencePath?.split("/").pop();

  return (
    <div className="bg-surface border border-border rounded-[10px] p-5 mb-3">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="font-semibold text-sm">{name}</div>
        {outcome ? (
          <div className={`font-mono-tabular text-[11.5px] ${OUTCOME_COLOR[outcome]}`}>
            Saved {savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}
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

      <Textarea
        placeholder="Add a comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={handleCommentBlur}
        className="min-h-[56px] mb-2"
      />

      {evidencePath ? (
        <div className="border border-border rounded-[7px] px-3.5 py-2.5 text-[12.5px] text-text-2 bg-surface-2 flex items-center gap-2">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth={2}>
            <path d="M20 6L9 17l-5-5" />
          </svg>
          {evidenceFilename}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="w-full border border-dashed border-danger-border rounded-[7px] px-3.5 py-2.5 text-[12.5px] text-text-3 flex items-center gap-2 cursor-pointer"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 3v13" />
            <path d="M7 8l5-5 5 5" />
            <path d="M5 21h14" />
          </svg>
          {uploading ? "Uploading…" : (
            <>
              Attach evidence <span className="text-danger">(required)</span>
            </>
          )}
        </button>
      )}
      <input ref={fileInput} type="file" className="hidden" onChange={handleFileChange} />
    </div>
  );
}
