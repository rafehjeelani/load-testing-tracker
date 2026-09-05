import { useState } from "react";
import { useParams } from "react-router-dom";
import { getTest, listCandidates, listIssuesForTest, listModerators, listSteps } from "../../lib/staffApi";
import type { CandidateListItem, Issue, Moderator, Step, Test } from "../../types";
import { formatTime } from "../../lib/outcome";
import { ErrorState, LoadingState, PageHeader, RefreshButton } from "../../components/ui";
import { TopNav } from "../staff/TopNav";
import { useAsyncLoad } from "../../lib/useAsyncLoad";

const OUTCOME_DOT_COLOR: Record<string, string> = {
  without_issues: "var(--success)",
  with_issues: "var(--warning)",
  unable: "var(--danger)",
};

interface TimelineEvent {
  time: number;
  kind: "step" | "issue";
  label: string;
  outcome?: string;
}

export default function Report() {
  const { testId } = useParams<{ testId: string }>();
  const [test, setTest] = useState<Test | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [issues, setIssues] = useState<(Issue & { candidate_email: string })[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!testId) return;
    const [t, s, c, m, iss] = await Promise.all([
      getTest(testId),
      listSteps(testId),
      listCandidates(testId),
      listModerators(),
      listIssuesForTest(testId),
    ]);
    setTest(t);
    setSteps([...s].sort((a, b) => a.order_index - b.order_index));
    setCandidates(c);
    setModerators(m);
    setIssues(iss);
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

  const timelineRows = candidates
    .map((c) => {
      const events: TimelineEvent[] = [];
      for (const s of steps) {
        const r = c.step_outcomes[s.id];
        if (r?.saved_at) {
          events.push({ time: new Date(r.saved_at).getTime(), kind: "step", label: s.name, outcome: r.outcome ?? undefined });
        }
      }
      for (const iss of issues) {
        if (iss.candidate_email !== c.email) continue;
        const stepName = iss.custom_step_name ?? steps.find((s) => s.id === iss.step_id)?.name ?? "Issue";
        events.push({ time: new Date(iss.created_at).getTime(), kind: "issue", label: stepName });
      }
      events.sort((a, b) => a.time - b.time);
      return { email: c.email, events };
    })
    .filter((row) => row.events.length > 0)
    .sort((a, b) => a.email.localeCompare(b.email));

  const allTimes = timelineRows.flatMap((r) => r.events.map((e) => e.time));
  const minTime = allTimes.length ? Math.min(...allTimes) : 0;
  const maxTime = allTimes.length ? Math.max(...allTimes) : 0;
  const timeSpan = maxTime - minTime || 1;

  const CHART_W = 1000;
  const MARGIN_LEFT = 200;
  const MARGIN_RIGHT = 20;
  const MARGIN_TOP = 26;
  const ROW_H = 26;
  const plotW = CHART_W - MARGIN_LEFT - MARGIN_RIGHT;
  const chartH = MARGIN_TOP + timelineRows.length * ROW_H + 10;

  function xForTime(t: number) {
    return MARGIN_LEFT + ((t - minTime) / timeSpan) * plotW;
  }

  const axisTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    x: MARGIN_LEFT + f * plotW,
    label: new Date(minTime + f * timeSpan).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  }));

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
      <PageHeader>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[22px] font-bold m-0">{test.name} — Report</h1>
          <RefreshButton onClick={handleRefresh} loading={refreshing} />
        </div>
      </PageHeader>
      <div className="max-w-[1240px] mx-auto px-8 pt-5 pb-7">
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
                <div className="w-40 text-[13px] font-semibold shrink-0">{f.name}</div>
                <div className="flex-1 min-w-0">
                  <div
                    className="h-7 rounded-md bg-accent"
                    style={{ width: `${maxFunnel ? (f.count / maxFunnel) * 100 : 0}%` }}
                  />
                </div>
                <div className="font-mono-tabular text-[13px] font-semibold shrink-0 whitespace-nowrap min-w-[72px] text-right">
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

        <div className="mb-1 font-bold text-[15px]">Session Timeline</div>
        <div className="text-[12.5px] text-text-3 mb-3">
          Every step save and logged issue, plotted against real time per candidate.
        </div>
        <div className="bg-surface border border-border rounded-[10px] p-5.5 mb-8">
          {timelineRows.length === 0 ? (
            <div className="text-[13px] text-text-3 text-center py-6">No session activity yet.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${CHART_W} ${chartH}`} width="100%" style={{ minWidth: 640 }}>
                  {axisTicks.map((t, i) => (
                    <g key={i}>
                      <line x1={t.x} y1={MARGIN_TOP - 8} x2={t.x} y2={chartH - 4} stroke="var(--border)" strokeWidth={1} />
                      <text x={t.x} y={14} fontSize={10} fill="var(--text-3)" textAnchor="middle">
                        {t.label}
                      </text>
                    </g>
                  ))}

                  {timelineRows.map((row, i) => {
                    const y = MARGIN_TOP + i * ROW_H + ROW_H / 2;
                    return (
                      <g key={row.email}>
                        <line
                          x1={MARGIN_LEFT}
                          y1={y}
                          x2={CHART_W - MARGIN_RIGHT}
                          y2={y}
                          stroke="var(--border-soft)"
                          strokeWidth={1}
                        />
                        <text x={MARGIN_LEFT - 10} y={y + 4} fontSize={11} fill="var(--text-2)" textAnchor="end">
                          {row.email.length > 26 ? `${row.email.slice(0, 24)}…` : row.email}
                        </text>
                        {row.events.length > 1 && (
                          <polyline
                            fill="none"
                            stroke="var(--border)"
                            strokeWidth={1.5}
                            points={row.events.map((e) => `${xForTime(e.time)},${y}`).join(" ")}
                          />
                        )}
                        {row.events.map((e, j) =>
                          e.kind === "issue" ? (
                            <rect
                              key={j}
                              x={xForTime(e.time) - 4}
                              y={y - 4}
                              width={8}
                              height={8}
                              transform={`rotate(45 ${xForTime(e.time)} ${y})`}
                              fill="var(--danger)"
                            >
                              <title>
                                {row.email} · Issue during {e.label} · {formatTime(new Date(e.time).toISOString())}
                              </title>
                            </rect>
                          ) : (
                            <circle
                              key={j}
                              cx={xForTime(e.time)}
                              cy={y}
                              r={4.5}
                              fill={OUTCOME_DOT_COLOR[e.outcome ?? ""] ?? "var(--text-3)"}
                            >
                              <title>
                                {row.email} · {e.label} · {formatTime(new Date(e.time).toISOString())}
                              </title>
                            </circle>
                          ),
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="flex items-center gap-5 flex-wrap mt-3 text-[12px] text-text-2">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "var(--success)" }} />
                  Step without issues
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "var(--warning)" }} />
                  Step with issues
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "var(--danger)" }} />
                  Step: unable to complete
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 inline-block"
                    style={{ background: "var(--danger)", transform: "rotate(45deg)" }}
                  />
                  Issue / disconnection logged
                </span>
              </div>
            </>
          )}
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
                      i === 0 ? "text-left" : "text-center"
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
                  <td className="px-4 py-2.5 text-center font-mono-tabular">{s.attempted}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tabular">{s.successful}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tabular">{s.issues}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tabular">{s.unable}</td>
                  <td
                    className={`px-4 py-2.5 text-center font-mono-tabular font-semibold ${
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
                      i === 0 ? "text-left" : "text-center"
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
