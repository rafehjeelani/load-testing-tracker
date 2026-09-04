import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addCandidate,
  assignModerator,
  listCandidates,
  listIssuesForTest,
  listModerators,
  listSteps,
  getTest,
  StaffApiError,
} from "../../lib/staffApi";
import type { CandidateListItem, Moderator, Step, Test } from "../../types";
import { formatTime, OUTCOME_TEXT_COLOR } from "../../lib/outcome";
import { downloadCsv } from "../../lib/csv";
import { Button } from "../../components/ui";
import { TopNav } from "../staff/TopNav";
import ModeratorSelect from "./ModeratorSelect";

function adminTabs(testId: string) {
  return [
    { label: "Candidates", to: `/admin/tests/${testId}/candidates` },
    { label: "Steps", to: `/admin/tests/${testId}/steps` },
    { label: "Moderators", to: `/admin/tests/${testId}/moderators` },
    { label: "Report", to: `/admin/tests/${testId}/report` },
  ];
}

export default function Candidates() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();

  const [test, setTest] = useState<Test | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [search, setSearch] = useState("");
  const [moderatorFilter, setModeratorFilter] = useState<string>("all");
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exportOpts, setExportOpts] = useState({
    summary: true,
    stepTimestamps: true,
    comments: true,
    evidenceLinks: false,
  });

  const load = useCallback(async () => {
    if (!testId) return;
    const [t, s, c, m] = await Promise.all([
      getTest(testId),
      listSteps(testId),
      listCandidates(testId),
      listModerators(),
    ]);
    setTest(t);
    setSteps(s);
    setCandidates(c);
    setModerators(m);
  }, [testId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!test || !testId) {
    return <div className="min-h-screen bg-bg flex items-center justify-center text-text-2 text-sm">Loading…</div>;
  }
  const testSlug = test.slug;

  const formUrl = `${window.location.origin}${import.meta.env.BASE_URL}t/${testSlug}`;

  const filtered = candidates.filter((c) => {
    if (search && !c.email.toLowerCase().includes(search.toLowerCase())) return false;
    if (moderatorFilter !== "all" && c.moderator_id !== moderatorFilter) return false;
    return true;
  });

  async function handleAddCandidate(e: FormEvent) {
    e.preventDefault();
    if (!newEmail.trim() || !testId) return;
    setAddError(null);
    try {
      await addCandidate(testId, newEmail.trim());
      setNewEmail("");
      setAdding(false);
      await load();
    } catch (err) {
      setAddError(err instanceof StaffApiError ? err.message : "Couldn't add that candidate.");
    }
  }

  async function handleAssign(candidateId: string, moderatorId: string | null) {
    setCandidates((cs) => cs.map((c) => (c.id === candidateId ? { ...c, moderator_id: moderatorId } : c)));
    await assignModerator(candidateId, moderatorId);
  }

  async function handleCopyUrl() {
    await navigator.clipboard.writeText(formUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleExport() {
    if (exportOpts.summary || exportOpts.stepTimestamps || exportOpts.comments || exportOpts.evidenceLinks) {
      const headers = ["Email", "Moderator", "Submitted", "Submitted At"];
      for (const step of steps) {
        if (exportOpts.stepTimestamps) headers.push(`${step.name} Outcome`, `${step.name} Saved At`);
        if (exportOpts.comments) headers.push(`${step.name} Comment`);
        if (exportOpts.evidenceLinks) headers.push(`${step.name} Evidence Path`);
      }
      const rows = filtered.map((c) => {
        const mod = moderators.find((m) => m.id === c.moderator_id);
        const row: unknown[] = [c.email, mod?.full_name ?? "", c.submitted ? "Yes" : "No", c.submitted_at ?? ""];
        for (const step of steps) {
          const r = c.step_outcomes[step.id];
          if (exportOpts.stepTimestamps) row.push(r?.outcome ?? "", r?.saved_at ?? "");
          if (exportOpts.comments) row.push(r?.comment ?? "");
          if (exportOpts.evidenceLinks) row.push(r?.evidence_path ?? "");
        }
        return row;
      });
      downloadCsv(`${testSlug}-candidates.csv`, headers, rows);
    }

    if (exportOpts.comments) {
      const issues = await listIssuesForTest(testId!);
      const headers = ["Candidate", "Step", "Comment", "Evidence Path", "Logged At"];
      const rows = issues.map((i) => [
        i.candidate_email,
        i.custom_step_name ?? steps.find((s) => s.id === i.step_id)?.name ?? "",
        i.comment,
        i.evidence_path,
        i.created_at,
      ]);
      downloadCsv(`${testSlug}-issues.csv`, headers, rows);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <TopNav brandTo="/admin" tabs={adminTabs(testId)} />
      <div className="max-w-[1240px] mx-auto px-8 py-7">
        <div className="mb-4.5">
          <h1 className="text-[22px] font-bold m-0">{test.name}</h1>
          <div className="text-[12.5px] text-text-3 mt-1">
            Candidates self-report their progress through this test on their own device while taking the real test
            in Talview
          </div>
        </div>

        <div className="bg-surface border border-border rounded-[10px] p-4 mb-4.5">
          <div className="text-[11.5px] font-semibold text-text-3 uppercase tracking-wide mb-2">
            Candidate Form URL
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex-1 max-w-[520px] font-mono-tabular text-text-2 bg-surface-2 border border-border rounded-[7px] px-3 py-2.5 text-[13px] overflow-x-auto whitespace-nowrap">
              {formUrl}
            </div>
            <Button variant="secondary" onClick={handleCopyUrl} className="flex items-center gap-1.5">
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="9" width="12" height="12" rx="1.5" />
                <path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" />
              </svg>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2.5 mb-3.5 flex-wrap">
          <input
            placeholder="Search by email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 px-3 py-2 border border-border rounded-[7px] bg-surface text-[13px]"
          />
          <select
            value={moderatorFilter}
            onChange={(e) => setModeratorFilter(e.target.value)}
            className="px-2.5 py-2 border border-border rounded-[6px] bg-surface-2 text-[13px]"
          >
            <option value="all">All moderators</option>
            <option value="">Unassigned</option>
            {moderators.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <Button variant="secondary" onClick={handleExport} className="flex items-center gap-1.5">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 3v13" />
              <path d="M17 11l-5 5-5-5" />
              <path d="M5 21h14" />
            </svg>
            Export
          </Button>
        </div>

        <div className="bg-surface border border-dashed border-border rounded-[10px] p-4 mb-4.5">
          <div className="text-[11.5px] font-semibold text-text-3 uppercase tracking-wide mb-2.5">
            Export Candidate List
          </div>
          <div className="flex items-center gap-4 flex-wrap text-[13px]">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOpts.stepTimestamps}
                onChange={(e) => setExportOpts((o) => ({ ...o, stepTimestamps: e.target.checked }))}
              />
              Step Timestamps
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOpts.comments}
                onChange={(e) => setExportOpts((o) => ({ ...o, comments: e.target.checked }))}
              />
              Comments &amp; Issues
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={exportOpts.evidenceLinks}
                onChange={(e) => setExportOpts((o) => ({ ...o, evidenceLinks: e.target.checked }))}
              />
              Evidence File Links
            </label>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-[10px] overflow-x-auto">
          <table className="w-full text-[13.5px] min-w-[900px]">
            <thead>
              <tr className="bg-surface-2">
                <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide border-b border-border">
                  Email
                </th>
                <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide border-b border-border">
                  Moderator
                </th>
                {steps.map((s) => (
                  <th
                    key={s.id}
                    className="text-right px-4 py-2.5 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide border-b border-border whitespace-nowrap"
                  >
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !adding && (
                <tr>
                  <td colSpan={2 + steps.length} className="px-4 py-6 text-center text-text-3">
                    No candidates yet.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border-soft last:border-0 hover:bg-surface-2">
                  <td
                    onClick={() => navigate(`/admin/tests/${testId}/candidates/${c.id}`)}
                    className="px-4 py-2.5 font-semibold cursor-pointer"
                  >
                    {c.email}
                  </td>
                  <td className="px-4 py-2.5">
                    <ModeratorSelect
                      moderators={moderators}
                      value={c.moderator_id}
                      onChange={(id) => handleAssign(c.id, id)}
                    />
                  </td>
                  {steps.map((s) => {
                    const r = c.step_outcomes[s.id];
                    return (
                      <td
                        key={s.id}
                        onClick={() => navigate(`/admin/tests/${testId}/candidates/${c.id}`)}
                        className={`px-4 py-2.5 text-right font-mono-tabular cursor-pointer ${
                          r?.outcome ? OUTCOME_TEXT_COLOR[r.outcome] : "text-text-3"
                        }`}
                      >
                        {r?.outcome ? formatTime(r.saved_at) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {adding ? (
                <tr className="bg-accent-soft">
                  <td className="px-4 py-2" colSpan={2}>
                    <form onSubmit={handleAddCandidate} className="flex items-center gap-2">
                      <input
                        autoFocus
                        type="email"
                        required
                        placeholder="candidate@example.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 border border-border rounded-[6px] bg-surface text-[13px]"
                      />
                      <Button type="submit" className="flex items-center gap-1 whitespace-nowrap">
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        Save
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          setAdding(false);
                          setAddError(null);
                        }}
                        className="text-text-3 px-1 cursor-pointer"
                      >
                        ×
                      </button>
                    </form>
                    {addError && <div className="text-[12px] text-danger mt-1">{addError}</div>}
                  </td>
                  <td colSpan={steps.length} />
                </tr>
              ) : (
                <tr>
                  <td colSpan={2 + steps.length} className="p-0">
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      className="w-full flex items-center gap-1.5 px-4 py-2.5 text-[13px] text-accent font-semibold cursor-pointer hover:bg-surface-2"
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Add Candidate
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
