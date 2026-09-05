import { useState } from "react";
import { useParams } from "react-router-dom";
import { getTest, listCandidates, listModerators } from "../../lib/staffApi";
import type { CandidateListItem, Moderator, Test } from "../../types";
import { Badge, ErrorState, LoadingState, PageHeader, RefreshButton } from "../../components/ui";
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
              Operational workload balance across moderators — not a performance ranking. Manage
              accounts under Users.
            </div>
          </div>
          <RefreshButton onClick={handleRefresh} loading={refreshing} />
        </div>
      </PageHeader>
      <div className="max-w-[1240px] mx-auto px-8 pt-5 pb-7">
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
