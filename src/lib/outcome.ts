import type { Outcome } from "../types";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  without_issues: "Completed without issues",
  with_issues: "Completed with issues",
  unable: "Was not able to complete",
};

export const OUTCOME_TEXT_COLOR: Record<Outcome, string> = {
  without_issues: "text-success",
  with_issues: "text-warning",
  unable: "text-danger",
};

export function formatTime(iso: string | null): string {
  if (!iso) return "";
  // hour12 is forced explicitly -- locale defaults (hour: "numeric" alone)
  // silently switch to 24-hour time on many system locales otherwise.
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

/** "HH:MM" (24h, for <input type="time">) from an ISO string, in the local timezone. */
export function toTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Combines an existing ISO timestamp's date with a new "HH:MM" (24h) time, in the local timezone. */
export function withTimeInputValue(iso: string, hhmm: string): string {
  const d = new Date(iso);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
