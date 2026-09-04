import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTest, listCandidates, listSteps } from "../../lib/staffApi";
import type { CandidateListItem, Step, Test } from "../../types";
import { formatTime, OUTCOME_TEXT_COLOR } from "../../lib/outcome";
import { TopNav } from "../staff/TopNav";

export default function ModeratorDashboard() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const [test, setTest] = useState<Test | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!testId) return;
    Promise.all([getTest(testId), listSteps(testId), listCandidates(testId)]).then(([t, s, c]) => {
      setTest(t);
      setSteps(s);
      setCandidates(c);
    });
  }, [testId]);

  if (!test || !testId) {
    return <div className="min-h-screen bg-bg flex items-center justify-center text-text-2 text-sm">Loading…</div>;
  }

  const filtered = candidates.filter((c) => c.email.toLowerCase().includes(search.toLowerCase()));
  const completedAllSteps = candidates.filter((c) => steps.every((s) => c.step_outcomes[s.id]?.outcome)).length;
  const withIssues = candidates.filter((c) =>
    Object.values(c.step_outcomes).some((r) => r.outcome === "with_issues"),
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
      <div className="max-w-[1240px] mx-auto px-8 py-7">
        <h1 className="text-[22px] font-bold m-0 mb-1">{test.name}</h1>
        <div className="text-[12.5px] text-text-3 mb-5">Your assigned candidates</div>

        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            ["Assigned", candidates.length, "text-text"],
            ["Completed All Steps", completedAllSteps, "text-success"],
            ["With Issues", withIssues, "text-warning"],
            ["Unable to Complete", unable, "text-danger"],
          ].map(([label, value, color]) => (
            <div key={label as string} className="bg-surface border border-border rounded-[10px] p-4">
              <div className="text-[11.5px] font-semibold text-text-3 uppercase tracking-wide">{label}</div>
              <div className={`font-mono-tabular text-2xl font-semibold mt-1.5 ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        <input
          placeholder="Search by candidate email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 px-3 py-2 border border-border rounded-[7px] bg-surface text-[13px] mb-3.5"
        />

        <div className="bg-surface border border-border rounded-[10px] overflow-x-auto">
          <table className="w-full text-[13.5px] min-w-[800px]">
            <thead>
              <tr className="bg-surface-2">
                <th className="text-left px-4 py-2.5 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide border-b border-border">
                  Email
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
                  className="border-b border-border-soft last:border-0 hover:bg-surface-2 cursor-pointer"
                >
                  <td className="px-4 py-2.5 font-semibold">{c.email}</td>
                  {steps.map((s) => {
                    const r = c.step_outcomes[s.id];
                    return (
                      <td
                        key={s.id}
                        className={`px-4 py-2.5 text-right font-mono-tabular ${
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
