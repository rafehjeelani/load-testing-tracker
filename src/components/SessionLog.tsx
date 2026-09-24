import { useState } from "react";
import type { DisconnectedStream, Issue, Step, StepReportHistoryEntry } from "../types";
import EvidenceRow from "./EvidenceRow";
import { Badge } from "./ui";
import { OUTCOME_LABEL, OUTCOME_TEXT_COLOR, formatTime, toTimeInputValue, withTimeInputValue } from "../lib/outcome";

const STREAM_LABEL: Record<DisconnectedStream, string> = { primary: "Primary", screen: "Screen", secondary: "Secondary" };
const STREAM_OPTIONS: DisconnectedStream[] = ["primary", "screen", "secondary"];

// formatTime() only ever shows hour:minute -- fine for a single-day session,
// but a log spanning multiple days (e.g. a candidate who disconnected and
// came back the next morning) reads as scrambled without the date, even
// though it's genuinely sorted correctly. A separator row makes day
// boundaries visible instead of relying on the reader to notice.
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}
function dateKey(timeMs: number): string {
  return new Date(timeMs).toDateString();
}

/** What to correct and how, passed back through onEditTime -- a step entry
 *  names the exact attempt it came from (a step can have more than one row
 *  after a disconnection), an issue entry just its own id. */
export type LogEditTarget = { kind: "step"; stepId: string; attempt: number } | { kind: "issue"; issueId: string };

interface Props {
  steps: Step[];
  /** Every step submission across every attempt (not just the current
   *  one), combined with every disconnection and sorted by time. */
  history: StepReportHistoryEntry[];
  issues: Issue[];
  onDownloadEvidence: (path: string) => void;
  getPreviewUrl: (path: string) => Promise<string>;
  /** When provided, staff can correct an entry's time -- omitted on the
   *  candidate's own Preview, which stays read-only here. */
  onEditTime?: (target: LogEditTarget, newIso: string) => Promise<void>;
  /** When provided, staff can delete an entry -- a step entry removes that
   *  attempt's outcome/comment/evidence entirely, an issue entry removes
   *  the disconnection. Omitted on the candidate's own Preview. */
  onDelete?: (target: LogEditTarget) => Promise<void>;
  /** When provided, staff can correct which stream(s) a disconnection
   *  affected -- omitted on the candidate's own Preview. */
  onEditStreams?: (issueId: string, streams: DisconnectedStream[]) => Promise<void>;
}

type LogEntry =
  | {
      kind: "step";
      time: number;
      stepName: string;
      outcome: NonNullable<StepReportHistoryEntry["outcome"]>;
      comment: string | null;
      evidencePaths: string[];
      stepId: string;
      attempt: number;
    }
  | {
      kind: "disconnection";
      time: number;
      comment: string;
      evidencePaths: string[];
      disconnectedStreams: DisconnectedStream[];
      issueId: string;
    };

function editTargetFor(entry: LogEntry): LogEditTarget {
  return entry.kind === "step"
    ? { kind: "step", stepId: entry.stepId, attempt: entry.attempt }
    : { kind: "issue", issueId: entry.issueId };
}

/** Chronological list of every step submission (across every attempt) and
 *  every disconnection, in the order they happened -- so a step answered,
 *  disconnected, then re-answered shows as two entries instead of only the
 *  latest. Clicking any entry (step or disconnection) expands it to show
 *  what was actually submitted -- comment + evidence, for that specific
 *  attempt or that specific disconnection. Shared by the candidate's own
 *  Preview and the staff (admin/moderator) candidate-editing view, so both
 *  see the same history. */
export default function SessionLog({
  steps,
  history,
  issues,
  onDownloadEvidence,
  getPreviewUrl,
  onEditTime,
  onDelete,
  onEditStreams,
}: Props) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingTimeValue, setEditingTimeValue] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const [editingStreamsId, setEditingStreamsId] = useState<string | null>(null);
  const [editingStreamsValue, setEditingStreamsValue] = useState<DisconnectedStream[]>([]);
  const [streamsSaving, setStreamsSaving] = useState(false);

  const logEntries: LogEntry[] = [
    ...history
      .filter((h) => !!h.saved_at && !!h.outcome)
      .map((h) => ({
        time: new Date(h.saved_at!).getTime(),
        // Includes the network check when the caller passes it in `steps`
        // (Session Log's own choice, unlike the funnel/step-level views) --
        // excludes anything not in `steps` otherwise.
        stepName: steps.find((s) => s.id === h.step_id)?.name,
        outcome: h.outcome!,
        comment: h.comment,
        evidencePaths: h.evidence_paths,
        stepId: h.step_id,
        attempt: h.attempt,
      }))
      .filter((h): h is typeof h & { stepName: string } => !!h.stepName)
      .map((h) => ({ kind: "step" as const, ...h })),
    ...issues.map((i) => ({
      kind: "disconnection" as const,
      time: new Date(i.created_at).getTime(),
      comment: i.comment,
      evidencePaths: i.evidence_paths,
      disconnectedStreams: i.disconnected_streams,
      issueId: i.id,
    })),
  ].sort((a, b) => a.time - b.time);

  function startEditTime(i: number, entry: LogEntry) {
    setEditingIndex(i);
    setEditingTimeValue(toTimeInputValue(new Date(entry.time).toISOString()));
  }

  async function saveEditTime(entry: LogEntry) {
    if (!onEditTime) return;
    const nextIso = withTimeInputValue(new Date(entry.time).toISOString(), editingTimeValue);
    setEditSaving(true);
    try {
      await onEditTime(editTargetFor(entry), nextIso);
      setEditingIndex(null);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(i: number, entry: LogEntry) {
    if (!onDelete) return;
    const ok = window.confirm(
      entry.kind === "step"
        ? "Delete this step entry? This removes its outcome, comment, and evidence for this attempt. This can't be undone."
        : "Delete this disconnection? This can't be undone.",
    );
    if (!ok) return;
    setDeletingIndex(i);
    try {
      await onDelete(editTargetFor(entry));
    } finally {
      setDeletingIndex(null);
    }
  }

  function startEditStreams(entry: Extract<LogEntry, { kind: "disconnection" }>) {
    setEditingStreamsId(entry.issueId);
    setEditingStreamsValue(entry.disconnectedStreams);
  }

  function toggleEditingStream(key: DisconnectedStream) {
    setEditingStreamsValue((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function saveEditStreams(issueId: string) {
    if (!onEditStreams) return;
    setStreamsSaving(true);
    try {
      await onEditStreams(issueId, editingStreamsValue);
      setEditingStreamsId(null);
    } finally {
      setStreamsSaving(false);
    }
  }

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
            {(i === 0 || dateKey(entry.time) !== dateKey(logEntries[i - 1].time)) && (
              <div className={`text-[11px] font-semibold text-text-3 uppercase tracking-wide mb-1.5 ${i === 0 ? "" : "mt-2"}`}>
                {formatDate(new Date(entry.time).toISOString())}
              </div>
            )}
            <div className="w-full flex items-center gap-2 text-[12.5px]">
              <button
                type="button"
                onClick={() => setExpandedIndex((prev) => (prev === i ? null : i))}
                className="flex items-center gap-2 min-w-0 text-left cursor-pointer"
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
              </button>
              {editingIndex === i ? (
                <span className="flex items-center gap-1.5">
                  <input
                    type="time"
                    autoFocus
                    value={editingTimeValue}
                    onChange={(e) => setEditingTimeValue(e.target.value)}
                    className="px-2 py-1 border border-border rounded-[6px] bg-surface text-[12px] font-mono-tabular"
                  />
                  <button
                    type="button"
                    onClick={() => saveEditTime(entry)}
                    disabled={editSaving}
                    className="text-success cursor-pointer disabled:opacity-50"
                    title="Save time"
                  >
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingIndex(null)}
                    className="text-text-3 cursor-pointer text-[13px]"
                  >
                    ×
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-1 font-mono-tabular text-text-3 shrink-0">
                  · {formatTime(new Date(entry.time).toISOString())}
                  {onEditTime && (
                    <button
                      type="button"
                      onClick={() => startEditTime(i, entry)}
                      className="text-text-3 hover:text-accent cursor-pointer"
                      title="Edit time"
                    >
                      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(i, entry)}
                      disabled={deletingIndex === i}
                      className="text-text-3 hover:text-danger cursor-pointer disabled:opacity-50"
                      title={entry.kind === "step" ? "Delete this step entry" : "Delete disconnection"}
                    >
                      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M3 6h18" />
                        <path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6" />
                        <path d="M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  )}
                </span>
              )}
              <button
                type="button"
                onClick={() => setExpandedIndex((prev) => (prev === i ? null : i))}
                className="shrink-0 ml-auto text-text-3 cursor-pointer"
              >
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className={`transition-transform ${expandedIndex === i ? "rotate-180" : ""}`}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
            {expandedIndex === i && (
              <div className="ml-4 mt-1.5 mb-1 pl-3 border-l-2 border-border-soft flex flex-col gap-1.5">
                {entry.kind === "disconnection" &&
                  (editingStreamsId === entry.issueId ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-3 flex-wrap text-[12.5px]">
                        {STREAM_OPTIONS.map((key) => (
                          <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editingStreamsValue.includes(key)}
                              onChange={() => toggleEditingStream(key)}
                            />
                            {STREAM_LABEL[key]}
                          </label>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => saveEditStreams(entry.issueId)}
                          disabled={streamsSaving}
                          className="text-success cursor-pointer disabled:opacity-50"
                          title="Save streams"
                        >
                          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingStreamsId(null)}
                          className="text-text-3 cursor-pointer text-[13px]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {entry.disconnectedStreams.length > 0 ? (
                        entry.disconnectedStreams.map((s) => (
                          <Badge key={s} variant="neutral">
                            {STREAM_LABEL[s]}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-[12.5px] text-text-3">No stream recorded.</span>
                      )}
                      {onEditStreams && (
                        <button
                          type="button"
                          onClick={() => startEditStreams(entry)}
                          className="text-text-3 hover:text-accent cursor-pointer"
                          title="Edit disconnected stream(s)"
                        >
                          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
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
