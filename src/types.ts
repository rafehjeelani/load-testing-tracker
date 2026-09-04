export type Outcome = "without_issues" | "with_issues" | "unable";

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
  evidence_path: string | null;
  saved_at: string | null;
}

export interface Issue {
  id: string;
  step_id: string | null;
  custom_step_name: string | null;
  comment: string;
  evidence_path: string;
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
