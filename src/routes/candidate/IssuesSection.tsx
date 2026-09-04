import { useRef, useState } from "react";
import type { Issue, Step } from "../../types";
import { Badge, Button, FieldLabel, Textarea } from "../../components/ui";

const OTHER = "__other__";

interface Props {
  steps: Step[];
  issues: Issue[];
  onAdd: (
    stepId: string | null,
    customStepName: string | null,
    comment: string,
    evidencePath: string,
  ) => Promise<void>;
  onUpload: (file: File) => Promise<string>;
}

export default function IssuesSection({ steps, issues, onAdd, onUpload }: Props) {
  const [stepChoice, setStepChoice] = useState(steps[0]?.id ?? OTHER);
  const [customStepName, setCustomStepName] = useState("");
  const [comment, setComment] = useState("");
  const [evidencePath, setEvidencePath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      setEvidencePath(await onUpload(file));
    } finally {
      setUploading(false);
    }
  }

  const canSubmit = comment.trim().length > 0 && !!evidencePath && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const isOther = stepChoice === OTHER;
      await onAdd(isOther ? null : stepChoice, isOther ? customStepName.trim() : null, comment.trim(), evidencePath!);
      setComment("");
      setEvidencePath(null);
      setCustomStepName("");
    } finally {
      setSubmitting(false);
    }
  }

  function stepName(stepId: string | null, custom: string | null) {
    if (custom) return custom;
    return steps.find((s) => s.id === stepId)?.name ?? "Unknown step";
  }

  return (
    <div className="mt-7 mb-2">
      <div className="font-bold text-[15px]">Issues &amp; Disconnections</div>
      <div className="text-[12.5px] text-text-3 mb-3.5">
        Log anything that went wrong — a comment and evidence are required for each one.
      </div>

      {issues.map((issue) => (
        <div key={issue.id} className="bg-surface border border-border rounded-[10px] p-3.5 mb-2.5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
            <Badge variant="warning">{stepName(issue.step_id, issue.custom_step_name)}</Badge>
            <span className="font-mono-tabular text-[11.5px] text-text-3">
              Logged {new Date(issue.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
          <div className="text-[13px] mb-2">{issue.comment}</div>
          <div className="flex items-center gap-1.5 text-[12px] text-text-2">
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 3v13" />
              <path d="M7 8l5-5 5 5" />
              <path d="M5 21h14" />
            </svg>
            {issue.evidence_path.split("/").pop()}
          </div>
        </div>
      ))}

      <div className="bg-surface border border-dashed border-border rounded-[10px] p-4">
        <div className="font-semibold text-[13px] mb-3">Report an Issue</div>
        <div className="flex flex-col gap-3">
          <div>
            <FieldLabel>Step</FieldLabel>
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
              <FieldLabel>Custom step name</FieldLabel>
              <input
                className="w-full px-3 py-2.5 border border-border rounded-[7px] bg-surface text-text text-[13.5px]"
                placeholder="e.g. Pre-Test Setup"
                value={customStepName}
                onChange={(e) => setCustomStepName(e.target.value)}
              />
            </div>
          )}
          <div>
            <FieldLabel>
              Comment <span className="text-danger font-normal">(required)</span>
            </FieldLabel>
            <Textarea
              placeholder="Describe what happened"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[56px]"
            />
          </div>
          <div>
            <FieldLabel>
              Evidence <span className="text-danger font-normal">(required)</span>
            </FieldLabel>
            {evidencePath ? (
              <div className="border border-border rounded-[7px] px-3.5 py-2.5 text-[12.5px] text-text-2 bg-surface-2 flex items-center gap-2">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth={2}>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {evidencePath.split("/").pop()}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="w-full border border-dashed border-danger-border rounded-[7px] px-3.5 py-2.5 text-[12.5px] text-text-3 flex items-center gap-2 cursor-pointer"
              >
                {uploading ? "Uploading…" : "Attach a screenshot or file"}
              </button>
            )}
            <input ref={fileInput} type="file" className="hidden" onChange={handleFileChange} />
          </div>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="self-start">
            Add Issue
          </Button>
        </div>
      </div>
    </div>
  );
}
