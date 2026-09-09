import { useState } from "react";
import type { Issue, Step, StepReportHistoryEntry } from "../types";
import EvidenceRow from "./EvidenceRow";
import { OUTCOME_LABEL, OUTCOME_TEXT_COLOR, formatTime } from "../lib/outcome";

interface Props {
  steps: Step[];
  /** Every step submission across every attempt (not just the current
   *  one), combined with every disconnection and sorted by time. */
  history: StepReportHistoryEntry[];
  issues: Issue[];
  onDownloadEvidence: (path: string) => void;
  getPreviewUrl: (path: string) => Promise<string>;
}

type LogEntry =
  | {
      kind: "step";
      time: number;
      stepName: string;
      outcome: NonNullable<StepReportHistoryEntry["outcome"]>;
      comment: string | null;
      evidencePaths: string[];
    }
  | { kind: "disconnection"; time: number; comment: string; evidencePaths: string[] };

/** Chronological list of every step submission (across every attempt) and
 *  every disconnection, in the order they happened -- so a step answered,
 *  disconnected, then re-answered shows as two entries instead of only the
 *  latest. Clicking any entry (step or disconnection) expands it to show
 *  what was actually submitted -- comment + evidence, for that specific
 *  attempt or that specific disconnection. Shared by the candidate's own
 *  Preview and the staff (admin/moderator) candidate-editing view, so both
 *  see the same history. */
export default function SessionLog({ steps, history, issues, onDownloadEvidence, getPreviewUrl }: Props) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

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
        comment: h.comment,
        evidencePaths: h.evidence_paths,
      }))
      .filter((h): h is typeof h & { stepName: string } => !!h.stepName)
      .map((h) => ({ kind: "step" as const, ...h })),
    ...issues.map((i) => ({
      kind: "disconnection" as const,
      time: new Date(i.created_at).getTime(),
      comment: i.comment,
      evidencePaths: i.evidence_paths,
    })),
  ].sort((a, b) => a.time - b.time);

  if (logEntries.length === 0) return null;

  return (
    <div className="bg-surface border border-border rounded-[10px] p-5 mt-5">
      <div className="font-bold text-[15px] mb-1">Session Log</div>
      <div className="text-[12.5px] text-text-3 mb-3.5">
        Every step submission and disconnection, in the order they happened — if a step appears twice, a
        disconnection came in between. Click an entry to see what was submitted for it.
      </div>
      <div className="flex flex-col gap-2">
        {logEntries.map((entry, i) => (
          <div key={i}>
            <button
              type="button"
              onClick={() => setExpandedIndex((prev) => (prev === i ? null : i))}
              className="w-full flex items-center gap-2 text-[12.5px] text-left cursor-pointer"
            >
              {entry.kind === "disconnection" ? (
                <>
                  <span className="w-2 h-2 shrink-0 bg-warning" style={{ transform: "rotate(45deg)" }} />
                  <span className="font-semibold text-warning">Disconnection logged</span>
                </>
              ) : (
                <>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${entry.outcome === "unable" ? "bg-danger" : "bg-success"}`} />
                  <span className="font-semibold">{entry.stepName}</span>
                  <span className={OUTCOME_TEXT_COLOR[entry.outcome]}>{OUTCOME_LABEL[entry.outcome]}</span>
                </>
              )}
              <span className="font-mono-tabular text-text-3">
                · {formatTime(new Date(entry.time).toISOString())}
              </span>
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className={`shrink-0 ml-auto text-text-3 transition-transform ${expandedIndex === i ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {expandedIndex === i && (
              <div className="ml-4 mt-1.5 mb-1 pl-3 border-l-2 border-border-soft flex flex-col gap-1.5">
                {entry.comment && <div className="text-[12.5px] text-text-2">{entry.comment}</div>}
                {entry.evidencePaths.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {entry.evidencePaths.map((path) => (
                      <EvidenceRow key={path} path={path} onDownload={onDownloadEvidence} getPreviewUrl={getPreviewUrl} />
                    ))}
                  </div>
                ) : (
                  !entry.comment && <div className="text-[12.5px] text-text-3">No comment or evidence attached.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
