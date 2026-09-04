import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addIssueStaff,
  getCandidateFull,
  getEvidenceDownloadUrl,
  listSteps,
  submitFormStaff,
  upsertStepReportStaff,
  uploadEvidenceStaff,
} from "../../lib/staffApi";
import type { CandidateFull, Outcome, Step } from "../../types";
import { Badge, Button } from "../../components/ui";
import { Logo } from "../../components/Logo";
import IssuesSection from "../../components/IssuesSection";
import StaffStepRow from "./StaffStepRow";
import { useAuth } from "./AuthContext";

export default function CandidateForm() {
  const { candidateId } = useParams<{ candidateId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const homePath = profile ? `/${profile.role}` : "/";
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [full, setFull] = useState<CandidateFull | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!candidateId) return;
    const f = await getCandidateFull(candidateId);
    const s = await listSteps(f.candidate.test_id);
    setFull(f);
    setSteps(s);
  }, [candidateId]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  if (error) {
    return <div className="min-h-screen bg-bg flex items-center justify-center text-danger text-sm">{error}</div>;
  }
  if (!full || !steps || !candidateId) {
    return <div className="min-h-screen bg-bg flex items-center justify-center text-text-2 text-sm">Loading…</div>;
  }

  const reportByStep = new Map(full.step_reports.map((r) => [r.step_id, r]));
  const sortedSteps = [...steps].sort((a, b) => a.order_index - b.order_index);

  async function handleSave(
    stepId: string,
    outcome: Outcome | null,
    comment: string,
    evidencePath: string | null,
    stampSavedAt: boolean,
  ) {
    await upsertStepReportStaff(candidateId!, stepId, outcome, comment, evidencePath, stampSavedAt);
  }

  async function handleUpload(file: File) {
    return uploadEvidenceStaff(full!.candidate.test_id, candidateId!, file);
  }

  async function handleAddIssue(
    stepId: string | null,
    customStepName: string | null,
    comment: string,
    evidencePath: string,
  ) {
    await addIssueStaff(candidateId!, stepId, customStepName, comment, evidencePath);
    await load();
  }

  async function handleDownload(path: string) {
    const url = await getEvidenceDownloadUrl(path);
    window.open(url, "_blank");
  }

  async function handleSubmit() {
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
      <div className="border-b border-border bg-surface">
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

      <div className="max-w-[720px] mx-auto px-8 py-8">
        <div className="mb-5">
          <div className="font-mono-tabular text-xl font-bold break-all">{full.candidate.email}</div>
          <div className="text-text-3 text-[12.5px] font-semibold uppercase tracking-wide mt-1.5">
            Reporting for this test
          </div>
        </div>

        {sortedSteps.map((step) => {
          const report = reportByStep.get(step.id);
          return (
            <StaffStepRow
              key={step.id}
              name={step.name}
              radioGroup={`staff-step-${step.id}`}
              initialOutcome={report?.outcome ?? null}
              initialComment={report?.comment ?? ""}
              initialEvidencePath={report?.evidence_path ?? null}
              initialSavedAt={report?.saved_at ?? null}
              onSave={(outcome, comment, evidencePath, stampSavedAt) =>
                handleSave(step.id, outcome, comment, evidencePath, stampSavedAt)
              }
              onUpload={handleUpload}
            />
          );
        })}

        <IssuesSection
          steps={sortedSteps}
          issues={full.issues}
          onAdd={handleAddIssue}
          onUpload={handleUpload}
          onDownload={handleDownload}
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
          <Button onClick={handleSubmit} disabled={submitting} className="min-w-[220px]">
            {full.candidate.submitted ? "Resubmit on Behalf of Candidate" : "Submit on Behalf of Candidate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
