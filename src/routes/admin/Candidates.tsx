import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addCandidate,
  assignModerator,
  deleteCandidate,
  listCandidates,
  listIssuesForTest,
  listModerators,
  listSteps,
  getTest,
  updateCandidateEmail,
  updateTestName,
  StaffApiError,
} from "../../lib/staffApi";
import type { CandidateListItem, Moderator, Step, Test } from "../../types";
import { formatTime, OUTCOME_TEXT_COLOR } from "../../lib/outcome";
import { downloadCsv } from "../../lib/csv";
import { Button, ErrorState, LoadingState, PageHeader, RefreshButton } from "../../components/ui";
import { TopNav } from "../staff/TopNav";
import ModeratorSelect from "./ModeratorSelect";
import { useAsyncLoad } from "../../lib/useAsyncLoad";

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
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [exportOpts, setExportOpts] = useState({
    summary: true,
    stepTimestamps: true,
    comments: true,
    evidenceLinks: false,
  });

  async function load() {
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
  }

  const { status, error, slow, retry } = useAsyncLoad(load, [testId]);

  if (status === "loading") return <LoadingState slow={slow} />;
  if (status === "error") return <ErrorState message={error!} onRetry={retry} />;
  if (!test || !testId) return null;
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

  async function handleSaveEmail(candidateId: string) {
    const next = emailDraft.trim();
    const current = candidates.find((c) => c.id === candidateId)?.email;
    if (!next || next === current) {
      setEditingCandidateId(null);
      return;
    }
    await updateCandidateEmail(candidateId, next);
    setCandidates((cs) => cs.map((c) => (c.id === candidateId ? { ...c, email: next } : c)));
    setEditingCandidateId(null);
  }

  async function handleDeleteCandidate(candidate: CandidateListItem) {
    const ok = window.confirm(
      `Delete ${candidate.email}? This permanently deletes their step reports and logged issues too.`,
    );
    if (!ok) return;
    await deleteCandidate(candidate.id);
    setCandidates((cs) => cs.filter((c) => c.id !== candidate.id));
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSaveName() {
    const next = nameDraft.trim();
    if (!next || next === test!.name) {
      setEditingName(false);
      return;
    }
    await updateTestName(testId!, next);
    setTest((t) => (t ? { ...t, name: next } : t));
    setEditingName(false);
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
          if (exportOpts.evidenceLinks) row.push((r?.evidence_paths ?? []).join("; "));
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
        i.evidence_paths.join("; "),
        i.created_at,
      ]);
      downloadCsv(`${testSlug}-issues.csv`, headers, rows);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <TopNav brandTo="/admin" tabs={adminTabs(testId)} />
      <PageHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="text-[22px] font-bold px-2 py-1 border border-border rounded-[7px] bg-surface"
              />
              <button
                type="button"
                onClick={handleSaveName}
                className="text-success cursor-pointer"
                title="Save name"
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="text-text-3 cursor-pointer text-[18px]"
              >
                ×
              </button>
            </div>
          ) : (
            <h1 className="text-[22px] font-bold m-0 flex items-center gap-2 group">
              {test.name}
              <button
                type="button"
                onClick={() => {
                  setNameDraft(test.name);
                  setEditingName(true);
                }}
                className="text-text-3 hover:text-accent cursor-pointer"
                title="Edit test name"
              >
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </button>
            </h1>
          )}
          <div className="text-[12.5px] text-text-3 mt-1">
            Candidates self-report their progress through this test on their own device while taking the real test
            in Talview
          </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <RefreshButton onClick={handleRefresh} loading={refreshing} />
            <Button
              variant="secondary"
              onClick={() => navigate(`/moderator/tests/${testId}/dashboard`)}
              className="flex items-center gap-1.5 whitespace-nowrap"
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              View as Moderator
            </Button>
          </div>
        </div>
      </PageHeader>
      <div className="max-w-[1240px] mx-auto px-8 pt-5 pb-7">
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
              {filtered.map((c) => {
                const hasData = c.submitted || Object.values(c.step_outcomes).some((o) => o.outcome);
                return (
                <tr key={c.id} className="border-b border-border-soft last:border-0 hover:bg-surface-2">
                  {editingCandidateId === c.id ? (
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          type="email"
                          value={emailDraft}
                          onChange={(e) => setEmailDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEmail(c.id);
                            if (e.key === "Escape") setEditingCandidateId(null);
                          }}
                          className="flex-1 min-w-0 px-2 py-1 border border-border rounded-[6px] bg-surface text-[13px]"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEmail(c.id)}
                          className="text-success cursor-pointer shrink-0"
                          title="Save email"
                        >
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCandidateId(null)}
                          className="text-text-3 cursor-pointer text-[14px] shrink-0"
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  ) : (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          onClick={() => navigate(`/admin/tests/${testId}/candidates/${c.id}`)}
                          title={c.email}
                          className="font-semibold cursor-pointer truncate max-w-[220px]"
                        >
                          {c.email}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCandidateId(c.id);
                            setEmailDraft(c.email);
                          }}
                          className="text-text-3 hover:text-accent cursor-pointer shrink-0"
                          title="Edit email"
                        >
                          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        </button>
                        {!hasData && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCandidate(c);
                            }}
                            className="text-text-3 hover:text-danger cursor-pointer shrink-0"
                            title="Delete candidate"
                          >
                            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                              <path d="M3 6h18" />
                              <path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6" />
                              <path d="M10 11v6M14 11v6" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
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
                );
              })}
              {adding ? (
                <tr className="bg-accent-soft">
                  <td className="px-4 py-2" colSpan={2}>
                    <form onSubmit={handleAddCandidate} className="flex items-center gap-2">
                      <span className="text-danger text-[13px] shrink-0" title="Required">
                        *
                      </span>
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
