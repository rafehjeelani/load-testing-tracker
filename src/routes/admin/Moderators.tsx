import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getTest, listCandidates, listModerators } from "../../lib/staffApi";
import type { CandidateListItem, Moderator, Test } from "../../types";
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

  useEffect(() => {
    if (!testId) return;
    Promise.all([getTest(testId), listCandidates(testId), listModerators()]).then(
      ([t, candidates, moderators]) => {
        setTest(t);
        setRows(computeRows(moderators, candidates));
      },
    );
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
        <h1 className="text-[22px] font-bold m-0">{test.name} — Moderators</h1>
        <div className="text-[12.5px] text-text-3 mt-1 mb-5">
          Operational workload balance across moderators — not a performance ranking
        </div>

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
                    No moderators yet.
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
