export type Outcome = "completed" | "unable";
export type StaffRole = "admin" | "moderator";

export const MAX_EVIDENCE_FILES = 5;
export const MAX_EVIDENCE_FILE_SIZE_MB = 10;

export interface Step {
  id: string;
  name: string;
  order_index: number;
  required: boolean;
  /** A fixed, non-admin-configurable check every candidate does once, before
   *  the regular step wizard -- excluded from every ordinary step listing. */
  is_network_check: boolean;
}

export interface StepReport {
  step_id: string;
  outcome: Outcome | null;
  comment: string | null;
  evidence_paths: string[];
  saved_at: string | null;
  attempt: number;
}

/** One historical step submission across any candidate in a test, spanning
 *  every attempt (not just each candidate's current one) -- used only for
 *  the Report page's Session Timeline, which is about chronological
 *  activity rather than current status. */
export interface StepReportHistoryRow {
  candidate_email: string;
  step_id: string;
  outcome: Outcome | null;
  saved_at: string | null;
  attempt: number;
}

export interface Issue {
  id: string;
  step_id: string | null;
  custom_step_name: string | null;
  comment: string;
  evidence_paths: string[];
  created_at: string;
}

export interface CandidateState {
  test: { id: string; name: string };
  candidate: {
    id: string;
    email: string;
    submitted: boolean;
    submitted_at: string | null;
    current_attempt: number;
  };
  steps: Step[];
  step_reports: StepReport[];
  issues: Issue[];
}

// --- Staff (admin/moderator) side ---

export interface Profile {
  id: string;
  role: StaffRole;
  full_name: string;
  email: string;
}

export interface Test {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Moderator {
  id: string;
  full_name: string;
  email: string;
  role: StaffRole;
  active: boolean;
}

/** A candidate row as listed in the Candidates table, with one outcome per step. */
export interface CandidateListItem {
  id: string;
  email: string;
  moderator_id: string | null;
  submitted: boolean;
  submitted_at: string | null;
  // keyed by step_id
  step_outcomes: Record<
    string,
    {
      outcome: Outcome | null;
      saved_at: string | null;
      comment: string | null;
      evidence_paths: string[];
      updated_at: string | null;
    }
  >;
}

export interface CandidateFull {
  candidate: {
    id: string;
    test_id: string;
    email: string;
    moderator_id: string | null;
    submitted: boolean;
    submitted_at: string | null;
    current_attempt: number;
  };
  step_reports: StepReport[];
  issues: Issue[];
}
