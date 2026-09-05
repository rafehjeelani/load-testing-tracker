import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { Issue, Step } from "../types";
import { Badge, Button, FieldLabel, Modal, Textarea } from "./ui";
import EvidenceList from "./EvidenceList";
import { formatTime, toTimeInputValue, withTimeInputValue } from "../lib/outcome";

const OTHER = "__other__";
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]);
function isImagePath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.has(ext);
}

interface Props {
  steps: Step[];
  issues: Issue[];
  onAdd: (
    stepId: string | null,
    customStepName: string | null,
    comment: string,
    evidencePaths: string[],
  ) => Promise<void>;
  onUpload: (file: File) => Promise<string>;
  /** When provided, a "Download" action is shown next to each logged issue's evidence, via a signed URL. */
  onDownload?: (evidencePath: string) => Promise<void>;
  /** When provided, image evidence on already-logged issues gets a thumbnail preview, via a signed URL. */
  getPreviewUrl?: (evidencePath: string) => Promise<string>;
  /** When provided, staff can correct the "Logged at" time on an existing entry. */
  onEditTime?: (issueId: string, newIso: string) => Promise<void>;
}

export interface IssuesSectionHandle {
  /** Opens the "Report an Issue" modal -- called from a button elsewhere on the page (e.g. next to the candidate's email). */
  open: () => void;
}

const IssuesSection = forwardRef<IssuesSectionHandle, Props>(function IssuesSection(
  { steps, issues, onAdd, onUpload, onDownload, getPreviewUrl, onEditTime },
  ref,
) {
  const [formOpen, setFormOpen] = useState(false);
  const [stepChoice, setStepChoice] = useState(steps[0]?.id ?? OTHER);
  const [customStepName, setCustomStepName] = useState("");
  const [comment, setComment] = useState("");
  const [evidencePaths, setEvidencePaths] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState("");
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useImperativeHandle(ref, () => ({
    open: () => setFormOpen(true),
  }));

  useEffect(() => {
    if (!getPreviewUrl) return;
    const allPaths = issues.flatMap((i) => i.evidence_paths);
    const missing = [...new Set(allPaths.filter((p) => isImagePath(p) && !(p in previewUrls)))];
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.allSettled(missing.map((p) => getPreviewUrl(p).then((url) => [p, url] as const))).then((results) => {
      if (cancelled) return;
      const entries = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      if (entries.length === 0) return;
      setPreviewUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, getPreviewUrl]);

  const canSubmit = comment.trim().length > 0 && evidencePaths.length > 0 && !submitting;

  function resetForm() {
    setComment("");
    setEvidencePaths([]);
    setCustomStepName("");
    setStepChoice(steps[0]?.id ?? OTHER);
  }

  function closeForm() {
    resetForm();
    setFormOpen(false);
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const isOther = stepChoice === OTHER;
      await onAdd(isOther ? null : stepChoice, isOther ? customStepName.trim() : null, comment.trim(), evidencePaths);
      closeForm();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDownload(path: string) {
    if (!onDownload) return;
    setDownloadingPath(path);
    try {
      await onDownload(path);
    } finally {
      setDownloadingPath(null);
    }
  }

  function startEditTime(issue: Issue) {
    setEditingTimeId(issue.id);
    setEditingTimeValue(toTimeInputValue(issue.created_at));
  }

  async function saveEditTime(issue: Issue) {
    if (!onEditTime) return;
    await onEditTime(issue.id, withTimeInputValue(issue.created_at, editingTimeValue));
    setEditingTimeId(null);
  }

  function stepName(stepId: string | null, custom: string | null) {
    if (custom) return custom;
    return steps.find((s) => s.id === stepId)?.name ?? "Unknown step";
  }

  return (
    <div className="mt-7 mb-2">
      <div className="font-bold text-[15px] mb-1">Issues &amp; Disconnections</div>
      <div className="text-[12.5px] text-text-3 mb-3.5">
        Log anything that went wrong — a comment and at least one piece of evidence are required.
      </div>

      {issues.length === 0 && (
        <div className="text-[13px] text-text-3 border border-dashed border-border rounded-[10px] p-4 text-center">
          Nothing logged yet.
        </div>
      )}

      {issues.map((issue) => (
        <div key={issue.id} className="bg-surface border border-border rounded-[10px] p-3.5 mb-2.5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <Badge variant="warning">{stepName(issue.step_id, issue.custom_step_name)}</Badge>
            {editingTimeId === issue.id ? (
              <span className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={editingTimeValue}
                  onChange={(e) => setEditingTimeValue(e.target.value)}
                  className="px-2 py-1 border border-border rounded-[6px] bg-surface text-[12px] font-mono-tabular"
                />
                <button
                  type="button"
                  onClick={() => saveEditTime(issue)}
                  className="text-success cursor-pointer"
                  title="Save time"
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTimeId(null)}
                  className="text-text-3 cursor-pointer text-[13px]"
                >
                  ×
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-mono-tabular text-[11.5px] text-text-3">
                Logged {formatTime(issue.created_at)}
                {onEditTime && (
                  <button
                    type="button"
                    onClick={() => startEditTime(issue)}
                    className="text-text-3 hover:text-accent cursor-pointer"
                    title="Edit time"
                  >
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </button>
                )}
              </span>
            )}
          </div>
          <div className="text-[13px] mb-2">{issue.comment}</div>
          <div className="flex flex-col gap-1">
            {issue.evidence_paths.map((path) => (
              <div key={path} className="flex items-center justify-between gap-2 text-[12px] text-text-2">
                <span className="flex items-center gap-1.5 min-w-0">
                  {previewUrls[path] ? (
                    <img
                      src={previewUrls[path]}
                      alt=""
                      className="w-6 h-6 rounded-[4px] object-cover shrink-0 border border-border"
                    />
                  ) : (
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="shrink-0">
                      <path d="M12 3v13" />
                      <path d="M7 8l5-5 5 5" />
                      <path d="M5 21h14" />
                    </svg>
                  )}
                  <span className="truncate">{path.split("/").pop()}</span>
                </span>
                {onDownload && (
                  <button
                    type="button"
                    onClick={() => handleDownload(path)}
                    disabled={downloadingPath === path}
                    className="flex items-center gap-1.5 text-accent font-semibold cursor-pointer shrink-0"
                  >
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M12 3v13" />
                      <path d="M17 11l-5 5-5-5" />
                      <path d="M5 21h14" />
                    </svg>
                    {downloadingPath === path ? "Preparing…" : "Download"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <Modal open={formOpen} onClose={closeForm} title="Report an Issue">
        <div className="flex flex-col gap-3">
          <div>
            <FieldLabel required>Step</FieldLabel>
            <select
              className="w-full px-3 py-2.5 border border-border rounded-[7px] bg-surface text-text text-[13.5px]"
              value={stepChoice}
              onChange={(e) => setStepChoice(e.target.value)}
            >
              {steps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={OTHER}>Other</option>
            </select>
          </div>
          {stepChoice === OTHER && (
            <div>
              <FieldLabel required>Custom step name</FieldLabel>
              <input
                required
                className="w-full px-3 py-2.5 border border-border rounded-[7px] bg-surface text-text text-[13.5px]"
                placeholder="e.g. Pre-Test Setup"
                value={customStepName}
                onChange={(e) => setCustomStepName(e.target.value)}
              />
            </div>
          )}
          <div>
            <FieldLabel required>Comment</FieldLabel>
            <Textarea
              required
              placeholder="Describe what happened"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[56px]"
            />
          </div>
          <div>
            <FieldLabel required>Evidence</FieldLabel>
            <EvidenceList
              paths={evidencePaths}
              onAdd={(p) => setEvidencePaths((ps) => [...ps, p])}
              onRemove={(p) => setEvidencePaths((ps) => ps.filter((x) => x !== p))}
              onUpload={onUpload}
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              Add Issue
            </Button>
            <Button variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
});

export default IssuesSection;
