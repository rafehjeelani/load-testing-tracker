export type Outcome = "without_issues" | "with_issues" | "unable";
export type StaffRole = "admin" | "moderator";

export const MAX_EVIDENCE_FILES = 5;
export const MAX_EVIDENCE_FILE_SIZE_MB = 10;

export interface Step {
  id: string;
  name: string;
  order_index: number;
  required: boolean;
}

export interface StepReport {
  step_id: string;
  outcome: Outcome | null;
  comment: string | null;
  evidence_paths: string[];
  saved_at: string | null;
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
  };
  step_reports: StepReport[];
  issues: Issue[];
}
