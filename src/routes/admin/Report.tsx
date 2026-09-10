import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  getTest,
  listCandidates,
  listIssuesForTest,
  listModerators,
  listStepReportHistoryForTest,
  listSteps,
} from "../../lib/staffApi";
import type { CandidateListItem, Issue, Moderator, Step, StepReportHistoryRow, Test } from "../../types";
import { formatTime } from "../../lib/outcome";
import { ErrorState, LoadingState, PageHeader, RefreshButton } from "../../components/ui";
import { TopNav } from "../staff/TopNav";
import { useAsyncLoad } from "../../lib/useAsyncLoad";

const OUTCOME_DOT_COLOR: Record<string, string> = {
  completed: "var(--success)",
  unable: "var(--danger)",
};

interface TimelineEvent {
  time: number;
  kind: "step" | "issue";
  label: string;
  outcome?: string;
}

// Session-duration metrics: each is measured from the named anchor step to
// the "Session Completed" step (or, failing that, the last recorded event
// for that candidate). These rely on matching steps by name, since steps
// are admin-configured free text -- a test that doesn't use these exact
// names simply won't have a value for that metric.
const DURATION_METRICS = [
  { key: "primary", label: "Primary", anchorStepName: "Face Captured" },
  { key: "screen", label: "Screen", anchorStepName: "Screen Shared" },
  { key: "secondary", label: "Secondary", anchorStepName: "Onboarding Completed (Orientation check Submitted)" },
] as const;
const END_STEP_NAME = "Session Completed";

/** Sums only the active segments between an anchor step's occurrences: from
 *  each answer up to the next disconnection that falls before the following
 *  re-answer, plus the final answer through to endTime -- excluding the
 *  disconnected gap(s) in between. Falls back to the naive full span (and
 *  says so in the note) when a disconnection has no following re-answer to
 *  pair it with. */
function computeDurationSeconds(
  anchorTimes: number[],
  disconnectionTimes: number[],
  endTime: number | null,
): { seconds: number | null; note: string } {
  if (anchorTimes.length === 0) return { seconds: null, note: "step not reported" };
  if (endTime === null) return { seconds: null, note: "no end time available" };

  let total = 0;
  const notes: string[] = [];
  for (let i = 0; i < anchorTimes.length; i++) {
    const a = anchorTimes[i];
    const nextAnchor = i + 1 < anchorTimes.length ? anchorTimes[i + 1] : null;
    if (nextAnchor !== null) {
      const dBetween = disconnectionTimes.find((d) => d > a && d < nextAnchor);
      if (dBetween !== undefined) {
        total += (dBetween - a) / 1000;
      } else {
        notes.push("re-answered without a disconnection logged in between");
      }
    } else {
      total += (endTime - a) / 1000;
      const hadDisconnectionAfter = disconnectionTimes.some((d) => d > a && d < endTime);
      if (hadDisconnectionAfter) {
        notes.push(
          anchorTimes.length === 1
            ? "includes disconnection downtime (step wasn't re-answered)"
            : "includes downtime after the last answer",
        );
      }
    }
  }
  if (total < 0) return { seconds: null, note: "negative duration -- check for out-of-order timestamps" };
  return { seconds: total, note: notes.length ? notes.join("; ") : "clean" };
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function Report() {
  const { testId } = useParams<{ testId: string }>();
  const [test, setTest] = useState<Test | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [issues, setIssues] = useState<(Issue & { candidate_email: string })[]>([]);
  const [history, setHistory] = useState<StepReportHistoryRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [hiddenStepIds, setHiddenStepIds] = useState<Set<string>>(new Set());

  async function load() {
    if (!testId) return;
    const [t, s, c, m, iss, hist] = await Promise.all([
      getTest(testId),
      listSteps(testId),
      listCandidates(testId),
      listModerators(),
      listIssuesForTest(testId),
      listStepReportHistoryForTest(testId),
    ]);
    setTest(t);
    setSteps([...s].sort((a, b) => a.order_index - b.order_index));
    setCandidates(c);
    setModerators(m);
    setIssues(iss);
    setHistory(hist);
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

  // Every actual step submission across every attempt (not just each
  // candidate's current one, and not the network check, which isn't part
  // of the ordinary step sequence) -- the source of truth for "how much
  // reporting has actually happened," since a candidate's current-attempt
  // step_outcomes goes blank again after every disconnection even though
  // they clearly engaged with the form before that.
  const stepHistory = history.filter((h) => h.saved_at && steps.some((s) => s.id === h.step_id));

  const invited = candidates.length;
  const startedForm = candidates.filter((c) => stepHistory.some((h) => h.candidate_email === c.email)).length;
  // Mutually exclusive with unableToComplete on purpose: a candidate who
  // finished every step but had "Completed with issues" on one of them
  // belongs in Completed With Issues, not here -- otherwise the two tiles
  // double-count that candidate and their sum can exceed the invited count.
  const completedAllSteps = candidates.filter((c) =>
    steps.every((s) => c.step_outcomes[s.id]?.outcome === "completed"),
  ).length;
  const unableToComplete = candidates.filter((c) =>
    Object.values(c.step_outcomes).some((r) => r.outcome === "unable"),
  ).length;
  const formsSubmitted = candidates.filter((c) => c.submitted).length;
  const stepsSubmitted = stepHistory.length;
  const disconnectionsLogged = issues.length;

  const candidateActivity = candidates
    .map((c) => ({
      email: c.email,
      stepsFilled: stepHistory.filter((h) => h.candidate_email === c.email).length,
      disconnections: issues.filter((i) => i.candidate_email === c.email).length,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  const candidateDurations = candidates
    .map((c) => {
      const ownHistory = stepHistory.filter((h) => h.candidate_email === c.email);
      const disconnectionTimes = issues
        .filter((i) => i.candidate_email === c.email)
        .map((i) => new Date(i.created_at).getTime())
        .sort((a, b) => a - b);

      function timesForStepName(name: string): number[] {
        const step = steps.find((s) => s.name === name);
        if (!step) return [];
        return ownHistory
          .filter((h) => h.step_id === step.id)
          .map((h) => new Date(h.saved_at!).getTime())
          .sort((a, b) => a - b);
      }

      const endStepTimes = timesForStepName(END_STEP_NAME);
      let endTime: number | null = null;
      let endIsFallback = false;
      if (endStepTimes.length > 0) {
        endTime = endStepTimes[endStepTimes.length - 1];
      } else {
        const allTimes = [...ownHistory.map((h) => new Date(h.saved_at!).getTime()), ...disconnectionTimes];
        endTime = allTimes.length ? Math.max(...allTimes) : null;
        endIsFallback = endTime !== null;
      }

      const durations = DURATION_METRICS.map((m) => {
        const anchorTimes = timesForStepName(m.anchorStepName);
        const { seconds, note } = computeDurationSeconds(anchorTimes, disconnectionTimes, endTime);
        const fullNote =
          endIsFallback && seconds !== null
            ? note === "clean"
              ? "end time is the last recorded event, not Session Completed"
              : `${note}; end time is the last recorded event, not Session Completed`
            : note;
        return { ...m, seconds, note: fullNote };
      });

      return { email: c.email, durations };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  const durationTotals = DURATION_METRICS.map((m) => ({
    ...m,
    totalSeconds: candidateDurations.reduce((sum, c) => {
      const d = c.durations.find((x) => x.key === m.key);
      return sum + (d?.seconds ?? 0);
    }, 0),
  }));

  const summaryStats = [
    { label: "Invited", value: invited, color: "text-text", description: "Candidates added to this test." },
    {
      label: "Started Form",
      value: startedForm,
      color: "text-text",
      description: "Candidates who have recorded an outcome for at least one step, in this or any earlier attempt.",
    },
    {
      label: "Completed All Steps",
      value: completedAllSteps,
      color: "text-success",
      description: "Candidates who reported “Completed” (not “Completed with issues”) on every step in this test.",
    },
    {
      label: "Completed With Issues",
      value: unableToComplete,
      color: "text-danger",
      description: "Candidates who reported “Completed with issues” on at least one step.",
    },
  ];

  const funnel = [
    { name: "Invited", count: invited },
    ...steps.map((s) => ({
      name: s.name,
      // Excludes "unable" -- a candidate who was unable to complete a step
      // didn't actually make it through, so they shouldn't count as having
      // reached this stage of the funnel.
      count: candidates.filter((c) => {
        const outcome = c.step_outcomes[s.id]?.outcome;
        return outcome && outcome !== "unable";
      }).length,
    })),
  ];
  // A funnel can only ever narrow -- each stage's count is clamped to the
  // stage before it. Without this, a candidate whose *current* attempt has
  // a later step reported but an earlier one skipped (they jumped ahead via
  // the step dropdown, or Skip'd a step that didn't need redoing after a
  // disconnection) would make a later bar bigger than an earlier one, which
  // isn't a sensible thing for a funnel to show.
  for (let i = 1; i < funnel.length; i++) {
    funnel[i].count = Math.min(funnel[i].count, funnel[i - 1].count);
  }
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
    const successful = outcomes.filter((o) => o === "completed").length;
    const unable = outcomes.filter((o) => o === "unable").length;
    const unableRate = attempted ? (unable / attempted) * 100 : 0;
    return { step: s, attempted, successful, unable, unableRate };
  });

  // Built from the full step_reports history (every attempt, not just each
  // candidate's current one) so a disconnection's new attempt shows up as a
  // second dot for that step instead of overwriting the first -- that's the
  // whole point of the timeline.
  const eventsByEmail = new Map<string, TimelineEvent[]>();
  for (const r of history) {
    if (!r.saved_at) continue;
    if (hiddenStepIds.has(r.step_id)) continue;
    const stepName = steps.find((s) => s.id === r.step_id)?.name;
    if (!stepName) continue;
    const events = eventsByEmail.get(r.candidate_email) ?? [];
    events.push({ time: new Date(r.saved_at).getTime(), kind: "step", label: stepName, outcome: r.outcome ?? undefined });
    eventsByEmail.set(r.candidate_email, events);
  }
  for (const iss of issues) {
    if (iss.step_id && hiddenStepIds.has(iss.step_id)) continue;
    const stepName = iss.custom_step_name ?? steps.find((s) => s.id === iss.step_id)?.name ?? "Issue";
    const events = eventsByEmail.get(iss.candidate_email) ?? [];
    events.push({ time: new Date(iss.created_at).getTime(), kind: "issue", label: stepName });
    eventsByEmail.set(iss.candidate_email, events);
  }
  const timelineRows = [...eventsByEmail.entries()]
    .map(([email, events]) => ({ email, events: [...events].sort((a, b) => a.time - b.time) }))
    .filter((row) => row.events.length > 0)
    .sort((a, b) => a.email.localeCompare(b.email));
  const allStepsHidden = steps.length > 0 && hiddenStepIds.size === steps.length;

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

  const modRows = moderators
    .map((m) => {
      const mine = candidates.filter((c) => c.moderator_id === m.id);
      return {
        moderator: m,
        assigned: mine.length,
        completed: mine.filter((c) => c.submitted).length,
        blocked: mine.filter((c) => Object.values(c.step_outcomes).some((r) => r.outcome === "unable")).length,
      };
    })
    // Most orgs have far more moderators than any single test needs -- only
    // show the ones actually carrying candidates on this test.
    .filter((r) => r.assigned > 0);

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
        <div className="grid grid-cols-4 gap-3 mb-4">
          {summaryStats.map((s) => (
            <div key={s.label} className="bg-surface border border-border rounded-[10px] p-4">
              <div
                title={s.description}
                className="flex items-center gap-1 text-[11.5px] font-semibold text-text-3 uppercase tracking-wide cursor-help"
              >
                {s.label}
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" />
                </svg>
              </div>
              <div className={`font-mono-tabular text-2xl font-semibold mt-1.5 ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr] gap-3 mb-8 items-stretch">
          {[
            { label: "Forms Submitted", value: formsSubmitted, description: "Candidates who have clicked Submit Form." },
            {
              label: "Steps Submitted",
              value: stepsSubmitted,
              description:
                "Total step submissions across every candidate and every attempt -- a step re-answered after a disconnection counts again.",
            },
            {
              label: "Disconnections Logged",
              value: disconnectionsLogged,
              description: "Total disconnections logged across every candidate in this test.",
            },
          ].map((s) => (
            <div key={s.label} className="bg-surface border border-border rounded-[10px] p-4">
              <div title={s.description} className="text-[11.5px] font-semibold text-text-3 uppercase tracking-wide cursor-help">
                {s.label}
              </div>
              <div className="font-mono-tabular text-2xl font-semibold mt-1.5 text-text">{s.value}</div>
            </div>
          ))}
          <div className="bg-surface border border-border rounded-[10px] p-4 flex flex-col justify-center">
            <div className="text-[11.5px] font-semibold text-text-3 uppercase tracking-wide mb-2">
              Steps vs Disconnections
            </div>
            {stepsSubmitted + disconnectionsLogged > 0 ? (
              <>
                <div className="h-3 rounded-full overflow-hidden flex bg-surface-2">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${(stepsSubmitted / (stepsSubmitted + disconnectionsLogged)) * 100}%` }}
                    title={`${stepsSubmitted} steps`}
                  />
                  <div
                    className="h-full bg-danger"
                    style={{ width: `${(disconnectionsLogged / (stepsSubmitted + disconnectionsLogged)) * 100}%` }}
                    title={`${disconnectionsLogged} disconnections`}
                  />
                </div>
                <div className="font-mono-tabular text-[12px] text-text-2 mt-1.5">
                  {stepsSubmitted} steps · {disconnectionsLogged} disconnections
                </div>
              </>
            ) : (
              <div className="text-[13px] text-text-3">No activity yet.</div>
            )}
          </div>
        </div>

        <div className="mb-1 font-bold text-[15px]">Candidate Activity</div>
        <div className="text-[12.5px] text-text-3 mb-3">
          Steps filled counts every submission across every attempt, so a candidate who disconnected and
          re-answered steps will show more than the number of steps in this test.
        </div>
        <div className="bg-surface border border-border rounded-[10px] overflow-x-auto mb-8">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="bg-surface-2">
                {["Candidate", "Steps Filled", "Disconnections"].map((h, i) => (
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
              {candidateActivity.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-text-3">
                    No candidates on this test yet.
                  </td>
                </tr>
              )}
              {candidateActivity.map((c) => (
                <tr key={c.email} className="border-b border-border-soft last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{c.email}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tabular">{c.stepsFilled}</td>
                  <td
                    className={`px-4 py-2.5 text-center font-mono-tabular ${
                      c.disconnections > 0 ? "text-danger font-semibold" : ""
                    }`}
                  >
                    {c.disconnections}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-1 font-bold text-[15px]">Session Durations</div>
        <div className="text-[12.5px] text-text-3 mb-3">
          Primary = Face Captured → Session Completed. Screen = Screen Shared → Session Completed. Secondary
          = Onboarding Completed (Orientation check Submitted) → Session Completed, since that's the event
          when secondary recording starts. A step re-answered after a disconnection only counts the active
          time (the disconnected gap is excluded); one that wasn't re-answered includes that downtime instead
          — hover a highlighted value for details.
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {durationTotals.map((d) => (
            <div key={d.key} className="bg-surface border border-border rounded-[10px] p-4">
              <div className="text-[11.5px] font-semibold text-text-3 uppercase tracking-wide">
                Total {d.label} Duration
              </div>
              <div className="font-mono-tabular text-2xl font-semibold mt-1.5 text-text">
                {formatDuration(d.totalSeconds)}
              </div>
            </div>
          ))}
        </div>
        <div className="bg-surface border border-border rounded-[10px] overflow-x-auto mb-8">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="bg-surface-2">
                {["Candidate", ...DURATION_METRICS.map((m) => m.label)].map((h, i) => (
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
              {candidateDurations.length === 0 && (
                <tr>
                  <td colSpan={1 + DURATION_METRICS.length} className="px-4 py-6 text-center text-text-3">
                    No candidates on this test yet.
                  </td>
                </tr>
              )}
              {candidateDurations.map((c) => (
                <tr key={c.email} className="border-b border-border-soft last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{c.email}</td>
                  {c.durations.map((d) => (
                    <td
                      key={d.key}
                      title={d.note !== "clean" ? d.note : undefined}
                      className={`px-4 py-2.5 text-center font-mono-tabular ${
                        d.seconds !== null && d.note !== "clean" ? "text-warning cursor-help" : ""
                      }`}
                    >
                      {formatDuration(d.seconds)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
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
        {steps.length > 0 && (
          <div className="flex items-start gap-x-4 gap-y-2 flex-wrap mb-3 text-[12.5px]">
            <span className="text-text-3 font-semibold shrink-0 pt-0.5">Steps:</span>
            <div className="flex items-center gap-x-4 gap-y-2 flex-wrap flex-1">
              {steps.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!hiddenStepIds.has(s.id)}
                    onChange={() =>
                      setHiddenStepIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else next.add(s.id);
                        return next;
                      })
                    }
                  />
                  {s.name}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button type="button" onClick={() => setHiddenStepIds(new Set())} className="text-accent cursor-pointer">
                Select all
              </button>
              <button
                type="button"
                onClick={() => setHiddenStepIds(new Set(steps.map((s) => s.id)))}
                className="text-text-3 hover:text-danger cursor-pointer"
              >
                Clear all
              </button>
            </div>
          </div>
        )}
        <div className="bg-surface border border-border rounded-[10px] p-5.5 mb-8">
          {allStepsHidden ? (
            <div className="text-[13px] text-text-3 text-center py-6">
              All steps are hidden — check a step above to see its timeline.
            </div>
          ) : timelineRows.length === 0 ? (
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
                                {e.label} · {row.email} · {formatTime(new Date(e.time).toISOString())}
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
                  Step completed
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
                {["Step", "Attempted", "Successful", "Unable", "Unable Rate"].map((h, i) => (
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
                  <td className="px-4 py-2.5 text-center font-mono-tabular">{s.unable}</td>
                  <td
                    className={`px-4 py-2.5 text-center font-mono-tabular font-semibold ${
                      s.unableRate > 0 ? "text-danger" : "text-success"
                    }`}
                  >
                    {s.unableRate.toFixed(1)}%
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
                {["Moderator", "Candidates", "Completed", "Blocked"].map((h, i) => (
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
              {modRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-text-3">
                    No moderators have candidates assigned on this test yet.
                  </td>
                </tr>
              )}
              {modRows.map((r) => (
                <tr key={r.moderator.id} className="border-b border-border-soft last:border-0">
                  <td className="px-4 py-2.5 font-semibold">{r.moderator.full_name}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tabular">{r.assigned}</td>
                  <td className="px-4 py-2.5 text-center font-mono-tabular">{r.completed}</td>
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
