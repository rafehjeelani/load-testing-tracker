import { useRef, useState } from "react";
import type { Outcome } from "../../types";
import { OUTCOME_LABEL, OUTCOME_TEXT_COLOR, formatTime } from "../../lib/outcome";
import { Textarea } from "../../components/ui";
import { getEvidenceDownloadUrl } from "../../lib/staffApi";

interface Props {
  name: string;
  radioGroup: string;
  initialOutcome: Outcome | null;
  initialComment: string;
  initialEvidencePath: string | null;
  initialSavedAt: string | null;
  onSave: (outcome: Outcome | null, comment: string, evidencePath: string | null, stampSavedAt: boolean) => Promise<void>;
  onUpload: (file: File) => Promise<string>;
}

export default function StaffStepRow({
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
  const [downloading, setDownloading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleOutcomeChange(next: Outcome) {
    setOutcome(next);
    const now = new Date().toISOString();
    setSavedAt(now);
    await onSave(next, comment, evidencePath, true);
  }

  async function handleCommentBlur() {
    if (comment === initialComment) return;
    await onSave(outcome, comment, evidencePath, false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = await onUpload(file);
      setEvidencePath(path);
      await onSave(outcome, comment, path, false);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload() {
    if (!evidencePath) return;
    setDownloading(true);
    try {
      const url = await getEvidenceDownloadUrl(evidencePath);
      window.open(url, "_blank");
    } finally {
      setDownloading(false);
    }
  }

  const evidenceFilename = evidencePath?.split("/").pop();

  return (
    <div className="bg-surface border border-border rounded-[10px] p-5 mb-3">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="font-semibold text-sm">{name}</div>
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

      <Textarea
        placeholder="Add a comment (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onBlur={handleCommentBlur}
        className="min-h-[56px] mb-2"
      />

      {evidencePath ? (
        <div className="border border-border rounded-[7px] px-3.5 py-2.5 text-[12.5px] text-text-2 bg-surface-2 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth={2}>
              <path d="M20 6L9 17l-5-5" />
            </svg>
            {evidenceFilename}
          </span>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 text-[12px] text-accent font-semibold cursor-pointer"
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 3v13" />
              <path d="M17 11l-5 5-5-5" />
              <path d="M5 21h14" />
            </svg>
            {downloading ? "Preparing…" : "Download"}
          </button>
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
