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
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
