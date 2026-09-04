import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getTest, listCandidates, listModerators, listSteps } from "../../lib/staffApi";
import type { CandidateListItem, Moderator, Step, Test } from "../../types";
import { TopNav } from "../staff/TopNav";

export default function Report() {
  const { testId } = useParams<{ testId: string }>();
  const [test, setTest] = useState<Test | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [moderators, setModerators] = useState<Moderator[]>([]);

  useEffect(() => {
    if (!testId) return;
    Promise.all([getTest(testId), listSteps(testId), listCandidates(testId), listModerators()]).then(
      ([t, s, c, m]) => {
        setTest(t);
        setSteps([...s].sort((a, b) => a.order_index - b.order_index));
        setCandidates(c);
        setModerators(m);
      },
    );
  }, [testId]);

  if (!test || !testId) {
    return <div className="min-h-screen bg-bg flex items-center justify-center text-text-2 text-sm">Loading…</div>;
  }

  const registered = candidates.length;
  const startedForm = candidates.filter((c) => Object.values(c.step_outcomes).some((r) => r.outcome)).length;
  const completedAllSteps = candidates.filter((c) => steps.every((s) => c.step_outcomes[s.id]?.outcome)).length;
  const withIssues = candidates.filter((c) =>
    Object.values(c.step_outcomes).some((r) => r.outcome === "with_issues"),
  ).length;
  const unableToComplete = candidates.filter((c) =>
    Object.values(c.step_outcomes).some((r) => r.outcome === "unable"),
  ).length;

  const funnel = [
    { name: "Registered", count: registered },
    ...steps.map((s) => ({
      name: s.name,
      count: candidates.filter((c) => c.step_outcomes[s.id]?.outcome).length,
    })),
  ];
  const maxFunnel = funnel[0]?.count || 1;

  let biggestDrop = { from: "", to: "", count: 0, pct: 0 };
  for (let i = 1; i < funnel.length; i++) {
    const drop = funnel[i - 1].count - funnel[i].count;
    const pct = funnel[i - 1].count ? (drop / funnel[i - 1].count) * 100 : 0;
    if (drop > biggestDrop.count) biggestDrop = { from: funnel[i - 1].name, to: funnel[i].name, count: drop, pct };
  }

  const stepStats = steps.map((s) => {
    const outcomes = candidates.map((c) => c.step_outcomes[s.id]?.outcome).filter(Boolean);
    const attempted = outcomes.length;
    const successful = outcomes.filter((o) => o === "without_issues").length;
    const issues = outcomes.filter((o) => o === "with_issues").length;
    const unable = outcomes.filter((o) => o === "unable").length;
    const issueRate = attempted ? ((issues + unable) / attempted) * 100 : 0;
    return { step: s, attempted, successful, issues, unable, issueRate };
  });

  const modRows = moderators.map((m) => {
    const mine = candidates.filter((c) => c.moderator_id === m.id);
    return {
      moderator: m,
      assigned: mine.length,
      completed: mine.filter((c) => c.submitted).length,
      withIssues: mine.filter((c) => Object.values(c.step_outcomes).some((r) => r.outcome === "with_issues")).length,
      blocked: mine.filter((c) => Object.values(c.step_outcomes).some((r) => r.outcome === "unable")).length,
    };
  });

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
        <h1 className="text-[22px] font-bold m-0 mb-5">{test.name} — Report</h1>

        <div className="grid grid-cols-5 gap-3 mb-8">
          {[
            ["Registered", registered, "text-text"],
            ["Started Form", startedForm, "text-text"],
            ["Completed All Steps", completedAllSteps, "text-success"],
            ["With Issues", withIssues, "text-warning"],
            ["Unable to Complete", unableToComplete, "text-danger"],
          ].map(([label, value, color]) => (
            <div key={label as string} className="bg-surface border border-border rounded-[10px] p-4">
              <div className="text-[11.5px] font-semibold text-text-3 uppercase tracking-wide">{label}</div>
              <div className={`font-mono-tabular text-2xl font-semibold mt-1.5 ${color}`}>{value}</div>
            </div>
          ))}
        </div>

        <div className="mb-3 font-bold text-[15px]">Candidate Funnel</div>
        <div className="grid grid-cols-[2.1fr_1fr] gap-4 mb-8 items-start">
          <div className="bg-surface border border-border rounded-[10px] p-5.5">
            {funnel.map((f) => (
              <div key={f.name} className="flex items-center gap-4 mb-2">
                <div className="w-40 text-[13px] font-semibold">{f.name}</div>
                <div
                  className="h-7 rounded-md bg-accent"
                  style={{ width: `${maxFunnel ? (f.count / maxFunnel) * 100 : 0}%` }}
                />
                <div className="font-mono-tabular text-[13px] font-semibold ml-auto">
                  {f.count} · {maxFunnel ? Math.round((f.count / maxFunnel) * 100) : 0}%
                </div>
              </div>
            ))}
          </div>
          <div className="bg-warning-soft border border-warning-border rounded-[10px] p-5">
            <div className="text-[12px] font-bold uppercase tracking-wide text-warning mb-3">Biggest Drop-Off</div>
            {biggestDrop.count > 0 ? (
              <>
                <div className="font-bold text-[16px]">
                  {biggestDrop.from} → {biggestDrop.to}
                </div>
                <div className="font-mono-tabular text-3xl font-bold mt-3">{biggestDrop.count}</div>
                <div className="text-[13px] text-text-2">candidates</div>
                <div className="font-mono-tabular text-warning font-semibold mt-0.5">
                  {biggestDrop.pct.toFixed(1)}% drop
                </div>
              </>
            ) : (
              <div className="text-[13px] text-text-2">No drop-off yet.</div>
            )}
          </div>
        </div>

        <div className="mb-3 font-bold text-[15px]">Step-Level Performance</div>
        <div className="bg-surface border border-border rounded-[10px] overflow-x-auto mb-8">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="bg-surface-2">
                {["Step", "Attempted", "Successful", "Issues", "Unable", "Issue Rate"].map((h, i) => (
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
              {stepStats.map((s) => (
                <tr key={s.step.id} className="border-b border-border-soft last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{s.step.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tabular">{s.attempted}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tabular">{s.successful}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tabular">{s.issues}</td>
                  <td className="px-4 py-2.5 text-right font-mono-tabular">{s.unable}</td>
                  <td
                    className={`px-4 py-2.5 text-right font-mono-tabular font-semibold ${
                      s.issueRate > 0 ? "text-warning" : "text-success"
                    }`}
                  >
                    {s.issueRate.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-1 font-bold text-[15px]">Moderator Distribution</div>
        <div className="text-[12.5px] text-text-3 mb-3">Operational workload balance — not a performance ranking</div>
        <div className="bg-surface border border-border rounded-[10px] overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="bg-surface-2">
                {["Moderator", "Candidates", "Completed", "Issues", "Blocked"].map((h, i) => (
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
              {modRows.map((r) => (
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
