import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { getTest, inviteStaff, listCandidates, listModerators, StaffApiError } from "../../lib/staffApi";
import type { CandidateListItem, Moderator, StaffRole, Test } from "../../types";
import { Badge, Button, ErrorState, FieldLabel, Input, LoadingState, PageHeader, RefreshButton } from "../../components/ui";
import { TopNav } from "../staff/TopNav";
import { useAsyncLoad } from "../../lib/useAsyncLoad";

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
  const [inviteRole, setInviteRole] = useState<StaffRole>("moderator");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const { status, error, slow, retry } = useAsyncLoad(load, [testId]);

  function computeRows(moderators: Moderator[], candidates: CandidateListItem[]): Row[] {
    return moderators
      .map((m) => {
        const mine = candidates.filter((c) => c.moderator_id === m.id);
        return {
          moderator: m,
          assigned: mine.length,
          completed: mine.filter((c) => c.submitted).length,
          withIssues: mine.filter((c) => Object.values(c.step_outcomes).some((r) => r.outcome === "with_issues"))
            .length,
          blocked: mine.filter((c) => Object.values(c.step_outcomes).some((r) => r.outcome === "unable")).length,
        };
      })
      // Only show moderators with at least one assigned candidate on this
      // test -- an org can have many moderators, but most are irrelevant
      // noise on any single test's page.
      .filter((r) => r.assigned > 0);
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setInviteLoading(true);
    setInviteError(null);
    try {
      await inviteStaff(inviteEmail.trim(), inviteName.trim(), inviteRole);
      setInviteSent(true);
      await load();
    } catch (err) {
      setInviteError(err instanceof StaffApiError ? err.message : "Couldn't send the invite. Try again.");
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  function closeInvite() {
    setInviting(false);
    setInviteEmail("");
    setInviteName("");
    setInviteRole("moderator");
    setInviteError(null);
    setInviteSent(false);
  }

  if (status === "loading") return <LoadingState slow={slow} />;
  if (status === "error") return <ErrorState message={error!} onRetry={retry} />;
  if (!test || !rows || !testId) return null;

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
      <PageHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] font-bold m-0">{test.name} — Moderators</h1>
            <div className="text-[12.5px] text-text-3 mt-1">
              Operational workload balance across moderators — not a performance ranking
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RefreshButton onClick={handleRefresh} loading={refreshing} />
            <Button onClick={() => setInviting(true)} className="flex items-center gap-1.5 whitespace-nowrap">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Team Member
            </Button>
          </div>
        </div>
      </PageHeader>
      <div className="max-w-[1240px] mx-auto px-8 pt-5 pb-7">
        {inviting && (
          <div className="bg-surface border border-dashed border-border rounded-[10px] p-4 mb-5">
            {inviteSent ? (
              <div>
                <div className="font-semibold text-[13.5px] mb-1.5">Invite sent</div>
                <p className="text-[13px] text-text-2 mb-4 leading-relaxed">
                  <span className="font-semibold text-text">{inviteEmail}</span> will get an email with a link to
                  set their password and sign in as {inviteRole === "admin" ? "an admin" : "a moderator"}.
                </p>
                <Button variant="secondary" onClick={closeInvite}>
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="flex flex-col gap-3 max-w-xl">
                <div className="font-semibold text-[13.5px]">Add Team Member</div>
                <div>
                  <FieldLabel>Role</FieldLabel>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                      <input
                        type="radio"
                        name="invite-role"
                        checked={inviteRole === "moderator"}
                        onChange={() => setInviteRole("moderator")}
                      />
                      Moderator
                    </label>
                    <label className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                      <input
                        type="radio"
                        name="invite-role"
                        checked={inviteRole === "admin"}
                        onChange={() => setInviteRole("admin")}
                      />
                      Admin
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel required>Full Name</FieldLabel>
                  <Input
                    required
                    placeholder="e.g. Priya Nair"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel required>Email</FieldLabel>
                  <Input
                    type="email"
                    required
                    placeholder="moderator@talview.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>
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
                {["Moderator", "Role", "Candidates", "Completed", "With Issues", "Blocked"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide border-b border-border ${
                      i <= 1 ? "text-left" : "text-center"
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
                  <td colSpan={6} className="px-4 py-6 text-center text-text-3">
                    No moderators have candidates assigned on this test yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.moderator.id} className="border-b border-border-soft last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{r.moderator.full_name}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={r.moderator.role === "admin" ? "accent" : "neutral"}>
                      {r.moderator.role === "admin" ? "Admin" : "Moderator"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono-tabular">{r.assigned}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tabular">{r.completed}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tabular">{r.withIssues}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tabular">{r.blocked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
