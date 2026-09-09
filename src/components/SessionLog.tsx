import type { Issue, Step, StepReportHistoryEntry } from "../types";
import { OUTCOME_LABEL, OUTCOME_TEXT_COLOR, formatTime } from "../lib/outcome";

interface Props {
  steps: Step[];
  /** Every step submission across every attempt (not just the current
   *  one), combined with every disconnection and sorted by time. */
  history: StepReportHistoryEntry[];
  issues: Issue[];
}

type LogEntry =
  | { kind: "step"; time: number; stepName: string; outcome: NonNullable<StepReportHistoryEntry["outcome"]> }
  | { kind: "disconnection"; time: number };

/** Chronological list of every step submission (across every attempt) and
 *  every disconnection, in the order they happened -- so a step answered,
 *  disconnected, then re-answered shows as two entries instead of only the
 *  latest. Shared by the candidate's own Preview and the staff (admin/
 *  moderator) candidate-editing view, so both see the same history. */
export default function SessionLog({ steps, history, issues }: Props) {
  const logEntries: LogEntry[] = [
    ...history
      .filter((h) => !!h.saved_at && !!h.outcome)
      .map((h) => ({
        time: new Date(h.saved_at!).getTime(),
        // Excludes the network check (and anything else not in `steps`) --
        // it's not part of the ordinary step sequence, same as everywhere
        // else it's handled.
        stepName: steps.find((s) => s.id === h.step_id)?.name,
        outcome: h.outcome!,
      }))
      .filter((h): h is typeof h & { stepName: string } => !!h.stepName)
      .map((h) => ({ kind: "step" as const, ...h })),
    ...issues.map((i) => ({ kind: "disconnection" as const, time: new Date(i.created_at).getTime() })),
  ].sort((a, b) => a.time - b.time);

  if (logEntries.length === 0) return null;

  return (
    <div className="bg-surface border border-border rounded-[10px] p-5 mt-5">
      <div className="font-bold text-[15px] mb-1">Session Log</div>
      <div className="text-[12.5px] text-text-3 mb-3.5">
        Every step submission and disconnection, in the order they happened — if a step appears twice, a
        disconnection came in between.
      </div>
      <div className="flex flex-col gap-2">
        {logEntries.map((entry, i) =>
          entry.kind === "disconnection" ? (
            <div key={i} className="flex items-center gap-2 text-[12.5px]">
              <span className="w-2 h-2 shrink-0 bg-warning" style={{ transform: "rotate(45deg)" }} />
              <span className="font-semibold text-warning">Disconnection logged</span>
              <span className="font-mono-tabular text-text-3">· {formatTime(new Date(entry.time).toISOString())}</span>
            </div>
          ) : (
            <div key={i} className="flex items-center gap-2 text-[12.5px]">
              <span className={`w-2 h-2 rounded-full shrink-0 ${entry.outcome === "unable" ? "bg-danger" : "bg-success"}`} />
              <span className="font-semibold">{entry.stepName}</span>
              <span className={OUTCOME_TEXT_COLOR[entry.outcome]}>{OUTCOME_LABEL[entry.outcome]}</span>
              <span className="font-mono-tabular text-text-3">· {formatTime(new Date(entry.time).toISOString())}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
