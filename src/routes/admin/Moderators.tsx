import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { getTest, inviteModerator, listCandidates, listModerators, StaffApiError } from "../../lib/staffApi";
import type { CandidateListItem, Moderator, Test } from "../../types";
import { Button, FieldLabel, Input } from "../../components/ui";
import { TopNav } from "../staff/TopNav";

interface Row {
  moderator: Moderator;
  assigned: number;
  completed: number;
  withIssues: number;
  blocked: number;
}

export default function Moderators() {
  const { testId } = useParams<{ testId: string }>();
  const [test, setTest] = useState<Test | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

  async function load() {
    if (!testId) return;
    const [t, candidates, moderators] = await Promise.all([
      getTest(testId),
      listCandidates(testId),
      listModerators(),
    ]);
    setTest(t);
    setRows(computeRows(moderators, candidates));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  function computeRows(moderators: Moderator[], candidates: CandidateListItem[]): Row[] {
    return moderators.map((m) => {
      const mine = candidates.filter((c) => c.moderator_id === m.id);
      return {
        moderator: m,
        assigned: mine.length,
        completed: mine.filter((c) => c.submitted).length,
        withIssues: mine.filter((c) => Object.values(c.step_outcomes).some((r) => r.outcome === "with_issues"))
          .length,
        blocked: mine.filter((c) => Object.values(c.step_outcomes).some((r) => r.outcome === "unable")).length,
      };
    });
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setInviteLoading(true);
    setInviteError(null);
    try {
      await inviteModerator(inviteEmail.trim(), inviteName.trim());
      setInviteSent(true);
      await load();
    } catch (err) {
      setInviteError(err instanceof StaffApiError ? err.message : "Couldn't send the invite. Try again.");
    } finally {
      setInviteLoading(false);
    }
  }

  function closeInvite() {
    setInviting(false);
    setInviteEmail("");
    setInviteName("");
    setInviteError(null);
    setInviteSent(false);
  }

  if (!test || !rows || !testId) {
    return <div className="min-h-screen bg-bg flex items-center justify-center text-text-2 text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <TopNav
        brandTo="/admin"
        tabs={[
          { label: "Candidates", to: `/admin/tests/${testId}/candidates` },
          { label: "Steps", to: `/admin/tests/${testId}/steps` },
          { label: "Moderators", to: `/admin/tests/${testId}/moderators` },
          { label: "Report", to: `/admin/tests/${testId}/report` },
        ]}
      />
      <div className="max-w-[1240px] mx-auto px-8 py-7">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <h1 className="text-[22px] font-bold m-0">{test.name} — Moderators</h1>
            <div className="text-[12.5px] text-text-3 mt-1">
              Operational workload balance across moderators — not a performance ranking
            </div>
          </div>
          <Button onClick={() => setInviting(true)} className="flex items-center gap-1.5 whitespace-nowrap">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Invite Moderator
          </Button>
        </div>

        {inviting && (
          <div className="bg-surface border border-dashed border-border rounded-[10px] p-4 mb-5 max-w-md">
            {inviteSent ? (
              <div>
                <div className="font-semibold text-[13.5px] mb-1.5">Invite sent</div>
                <p className="text-[13px] text-text-2 mb-4 leading-relaxed">
                  <span className="font-semibold text-text">{inviteEmail}</span> will get an email with a link to
                  set their password and sign in as a moderator.
                </p>
                <Button variant="secondary" onClick={closeInvite}>
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="flex flex-col gap-3">
                <div className="font-semibold text-[13.5px]">Invite Moderator</div>
                <div>
                  <FieldLabel>Full Name</FieldLabel>
                  <Input
                    required
                    placeholder="e.g. Priya Nair"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Email</FieldLabel>
                  <Input
                    type="email"
                    required
                    placeholder="moderator@talview.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
                {inviteError && <div className="text-[12.5px] text-danger">{inviteError}</div>}
                <div className="flex items-center gap-2">
                  <Button type="submit" disabled={inviteLoading}>
                    {inviteLoading ? "Sending…" : "Send Invite"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={closeInvite}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        <div className="bg-surface border border-border rounded-[10px] overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="bg-surface-2">
                {["Moderator", "Candidates", "Completed", "With Issues", "Blocked"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide border-b border-border ${
                      i === 0 ? "text-left" : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-text-3">
                    No moderators yet — invite one to get started.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.moderator.id} className="border-b border-border-soft last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{r.moderator.full_name}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tabular">{r.assigned}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tabular">{r.completed}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tabular">{r.withIssues}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tabular">{r.blocked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
