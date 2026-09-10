import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTest, listCandidates, listSteps } from "../../lib/staffApi";
import type { CandidateListItem, Step, Test } from "../../types";
import { formatTime, OUTCOME_TEXT_COLOR } from "../../lib/outcome";
import { ErrorState, LoadingState, PageHeader, RefreshButton } from "../../components/ui";
import { TopNav } from "../staff/TopNav";
import { useAsyncLoad } from "../../lib/useAsyncLoad";

export default function ModeratorDashboard() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!testId) return;
    const [t, s, c] = await Promise.all([getTest(testId), listSteps(testId), listCandidates(testId)]);
    setTest(t);
    setSteps(s);
    setCandidates(c);
  }

  const { status, error, slow, retry } = useAsyncLoad(load, [testId]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  if (status === "loading") return <LoadingState slow={slow} />;
  if (status === "error") return <ErrorState message={error!} onRetry={retry} />;
  if (!test || !testId) return null;

  const filtered = candidates.filter((c) => c.email.toLowerCase().includes(search.toLowerCase()));
  // Mutually exclusive with `unable` on purpose -- a candidate who finished
  // every step but had "Completed with issues" on one of them belongs in
  // Completed With Issues, not here, matching the admin Report page.
  const completedAllSteps = candidates.filter((c) =>
    steps.every((s) => c.step_outcomes[s.id]?.outcome === "completed"),
  ).length;
  const unable = candidates.filter((c) => Object.values(c.step_outcomes).some((r) => r.outcome === "unable")).length;

  return (
    <div className="min-h-screen bg-bg text-text">
      <TopNav
        brandTo="/moderator"
        suffix="Moderator"
        tabs={[
          { label: "Dashboard", to: `/moderator/tests/${testId}/dashboard` },
          { label: "Live Monitoring", to: `/moderator/tests/${testId}/live` },
        ]}
      />
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[22px] font-bold m-0">{test.name}</h1>
          <RefreshButton onClick={handleRefresh} loading={refreshing} />
        </div>
        <div className="text-[12.5px] text-text-3 mt-1">Your assigned candidates</div>
      </PageHeader>
      <div className="max-w-[1240px] mx-auto px-8 pt-5 pb-7">
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            ["Assigned", candidates.length, "text-text"],
            ["Completed All Steps", completedAllSteps, "text-success"],
            ["Completed With Issues", unable, "text-danger"],
          ].map(([label, value, color]) => (
            <div key={label as string} className="bg-surface border border-border rounded-[10px] p-4">
              <div className="text-[11.5px] font-semibold text-text-3 uppercase tracking-wide">{label}</div>
              <div className={`font-mono-tabular text-2xl font-semibold mt-1.5 ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2.5 mb-3.5 flex-wrap">
          <input
            placeholder="Search by candidate email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 px-3 py-2 border border-border rounded-[7px] bg-surface text-[13px]"
          />
          <span className="text-[12.5px] text-text-3 font-mono-tabular whitespace-nowrap">
            {search.trim()
              ? `${filtered.length} of ${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`
              : `${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="bg-surface border border-border rounded-[10px] overflow-x-auto">
          <table className="w-full text-[13.5px] min-w-[800px]">
            <thead>
              <tr className="bg-surface-2">
                <th className="sticky left-0 z-10 bg-surface-2 text-left px-4 py-2.5 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide border-b border-r border-border">
                  Email
                </th>
                {steps.map((s) => {
                  // How many of the currently-displayed (filtered) candidates
                  // have a timestamp for this step in their current attempt.
                  const reportedCount = filtered.filter((c) => c.step_outcomes[s.id]?.outcome).length;
                  return (
                    <th
                      key={s.id}
                      className="w-[110px] text-right px-4 py-2.5 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide border-b border-border leading-tight"
                    >
                      {s.name}
                      <div className="font-mono-tabular normal-case font-normal text-text-2 mt-0.5">({reportedCount})</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={1 + steps.length} className="px-4 py-6 text-center text-text-3">
                    No candidates assigned to you yet.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/moderator/tests/${testId}/candidates/${c.id}`)}
                  className="group border-b border-border-soft last:border-0 hover:bg-surface-2 cursor-pointer"
                >
                  <td className="sticky left-0 z-10 bg-surface group-hover:bg-surface-2 border-r border-border px-4 py-2.5 font-semibold">
                    {c.email}
                  </td>
                  {steps.map((s) => {
                    const r = c.step_outcomes[s.id];
                    return (
                      <td
                        key={s.id}
                        className={`w-[110px] px-4 py-2.5 text-right font-mono-tabular ${
                          r?.outcome ? OUTCOME_TEXT_COLOR[r.outcome] : "text-text-3"
                        }`}
                      >
                        {r?.outcome ? formatTime(r.saved_at) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
