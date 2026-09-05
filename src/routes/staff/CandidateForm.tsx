import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addIssueStaff,
  getCandidateFull,
  getEvidenceDownloadUrl,
  listSteps,
  submitFormStaff,
  updateIssueTimestamp,
  updateStepReportSavedAt,
  upsertStepReportStaff,
  uploadEvidenceStaff,
} from "../../lib/staffApi";
import type { CandidateFull, Outcome, Step } from "../../types";
import { Badge, Button, ErrorState, LoadingState, PageHeader } from "../../components/ui";
import { Logo } from "../../components/Logo";
import IssuesSection, { type IssuesSectionHandle } from "../../components/IssuesSection";
import StaffStepRow from "./StaffStepRow";
import { useAuth } from "./AuthContext";
import { useAsyncLoad } from "../../lib/useAsyncLoad";

export default function CandidateForm() {
  const { candidateId } = useParams<{ candidateId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const homePath = profile ? `/${profile.role}` : "/";
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [full, setFull] = useState<CandidateFull | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const issuesRef = useRef<IssuesSectionHandle>(null);

  async function load() {
    if (!candidateId) return;
    const f = await getCandidateFull(candidateId);
    const s = await listSteps(f.candidate.test_id);
    setFull(f);
    setSteps(s);
  }

  const { status, error, slow, retry } = useAsyncLoad(load, [candidateId]);

  if (status === "loading") return <LoadingState slow={slow} />;
  if (status === "error") return <ErrorState message={error!} onRetry={retry} />;
  if (!full || !steps || !candidateId) return null;

  const reportByStep = new Map(full.step_reports.map((r) => [r.step_id, r]));
  const sortedSteps = [...steps].sort((a, b) => a.order_index - b.order_index);

  async function handleSave(
    stepId: string,
    outcome: Outcome | null,
    comment: string,
    evidencePaths: string[],
    stampSavedAt: boolean,
  ) {
    await upsertStepReportStaff(candidateId!, stepId, outcome, comment, evidencePaths, stampSavedAt);
    // Keep full.step_reports in sync with every save -- otherwise it stays
    // frozen at whatever loaded on page-open, and the submit-time
    // validation below (missing evidence/comment) silently checks stale
    // data instead of what was just entered.
    setFull((f) => {
      if (!f) return f;
      const existing = f.step_reports.find((r) => r.step_id === stepId);
      return {
        ...f,
        step_reports: [
          ...f.step_reports.filter((r) => r.step_id !== stepId),
          {
            step_id: stepId,
            outcome,
            comment,
            evidence_paths: evidencePaths,
            saved_at: stampSavedAt ? new Date().toISOString() : existing?.saved_at ?? null,
          },
        ],
      };
    });
  }

  async function handleEditSavedAt(stepId: string, savedAtIso: string) {
    await updateStepReportSavedAt(candidateId!, stepId, savedAtIso);
    await load();
  }

  async function handleUpload(file: File) {
    return uploadEvidenceStaff(full!.candidate.test_id, candidateId!, file);
  }

  async function handleAddIssue(
    stepId: string | null,
    customStepName: string | null,
    comment: string,
    evidencePaths: string[],
  ) {
    await addIssueStaff(candidateId!, stepId, customStepName, comment, evidencePaths);
    await load();
  }

  async function handleEditIssueTime(issueId: string, createdAtIso: string) {
    await updateIssueTimestamp(issueId, createdAtIso);
    await load();
  }

  async function handleDownload(path: string) {
    const url = await getEvidenceDownloadUrl(path);
    window.open(url, "_blank");
  }

  function missingEvidenceSteps(): string[] {
    return sortedSteps
      .filter((s) => {
        const r = reportByStep.get(s.id);
        return r?.outcome && r.evidence_paths.length === 0;
      })
      .map((s) => s.name);
  }

  function missingCommentSteps(): string[] {
    return sortedSteps
      .filter((s) => {
        const r = reportByStep.get(s.id);
        return (r?.outcome === "with_issues" || r?.outcome === "unable") && !r.comment?.trim();
      })
      .map((s) => s.name);
  }

  async function handleSubmit() {
    const missingEvidence = missingEvidenceSteps();
    const missingComment = missingCommentSteps();
    if (missingEvidence.length > 0 || missingComment.length > 0) {
      const parts: string[] = [];
      if (missingEvidence.length > 0) {
        parts.push(`attach at least one evidence file for: ${missingEvidence.join(", ")}`);
      }
      if (missingComment.length > 0) {
        parts.push(`add a comment explaining what happened for: ${missingComment.join(", ")}`);
      }
      setSubmitError(`Please ${parts.join("; and ")}.`);
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitFormStaff(candidateId!);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="max-w-[1240px] mx-auto px-8 h-[52px] flex items-center justify-between">
          <button onClick={() => navigate(homePath)} className="flex items-center gap-2 cursor-pointer">
            <Logo />
            <span className="font-semibold text-sm">Load Testing Tracker</span>
          </button>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-[13.5px] text-text-2 cursor-pointer"
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M19 12H5" />
              <path d="M11 18l-6-6 6-6" />
            </svg>
            Back
          </button>
        </div>
      </div>

      <PageHeader maxWidthClassName="max-w-[720px]" paddingClassName="px-8 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-mono-tabular text-xl font-bold break-all">{full.candidate.email}</div>
            <div className="text-text-3 text-[12.5px] font-semibold uppercase tracking-wide mt-1.5">
              Reporting for this test
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => issuesRef.current?.open()}
            className="flex items-center gap-1.5 whitespace-nowrap"
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Issue / Disconnection
          </Button>
        </div>
      </PageHeader>

      <div className="max-w-[720px] mx-auto px-8 pt-5 pb-8">
        {sortedSteps.map((step) => {
          const report = reportByStep.get(step.id);
          return (
            <StaffStepRow
              key={step.id}
              name={step.name}
              stepRequired={step.required}
              radioGroup={`staff-step-${step.id}`}
              initialOutcome={report?.outcome ?? null}
              initialComment={report?.comment ?? ""}
              initialEvidencePaths={report?.evidence_paths ?? []}
              initialSavedAt={report?.saved_at ?? null}
              onSave={(outcome, comment, evidencePaths, stampSavedAt) =>
                handleSave(step.id, outcome, comment, evidencePaths, stampSavedAt)
              }
              onUpload={handleUpload}
              onEditSavedAt={(savedAtIso) => handleEditSavedAt(step.id, savedAtIso)}
            />
          );
        })}

        <IssuesSection
          ref={issuesRef}
          steps={sortedSteps}
          issues={full.issues}
          onAdd={handleAddIssue}
          onUpload={handleUpload}
          onDownload={handleDownload}
          getPreviewUrl={getEvidenceDownloadUrl}
          onEditTime={handleEditIssueTime}
        />

        <div className="text-[12px] text-text-3 text-center mt-2">
          Changes save automatically, just like the candidate's own view.
        </div>

        <div className="bg-surface border border-border rounded-[10px] p-6 mt-5 text-center">
          <Badge variant={full.candidate.submitted ? "success" : "neutral"}>
            {full.candidate.submitted ? "Submitted" : "Not Submitted"}
          </Badge>
          <div className="text-[13px] text-text-2 max-w-[440px] mx-auto my-4 leading-relaxed">
            {full.candidate.submitted
              ? "The candidate has submitted this form. You can still edit it above."
              : "The candidate hasn't submitted this form yet. You can submit it on their behalf — they'll still be able to edit and resubmit afterward."}
          </div>
          {submitError && <div className="text-[12.5px] text-danger mb-3 max-w-[440px] mx-auto">{submitError}</div>}
          <Button onClick={handleSubmit} disabled={submitting} className="min-w-[220px]">
            {full.candidate.submitted ? "Resubmit on Behalf of Candidate" : "Submit on Behalf of Candidate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
