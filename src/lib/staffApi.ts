import { supabase } from "./supabase";
import type {
  CandidateFull,
  CandidateListItem,
  Issue,
  Moderator,
  Profile,
  Step,
  StepReport,
  Test,
} from "../types";

export class StaffApiError extends Error {}

async function unwrap<T>(
  query: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new StaffApiError(error.message);
  return data as T;
}

// --- Auth ---

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new StaffApiError(error.message);
}

export async function requestPasswordReset(email: string) {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new StaffApiError(error.message);
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new StaffApiError(error.message);
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, email")
    .eq("id", user.id)
    .single();
  // A missing row (not an admin/moderator yet) is a normal, silent "not set
  // up" state -- anything else (RLS denial, network error, etc.) is a real
  // failure the caller should be able to show to the user.
  if (error) {
    if (error.code === "PGRST116") return null; // "no rows" from .single()
    throw new StaffApiError(`Signed in, but couldn't load your account (${error.message}).`);
  }
  return data as Profile;
}

// --- Tests ---

export function listTests(): Promise<Test[]> {
  return unwrap(
    supabase.from("tests").select("id, name, slug, created_at").order("created_at", { ascending: false }),
  );
}

export function getTest(testId: string): Promise<Test> {
  return unwrap(
    supabase.from("tests").select("id, name, slug, created_at").eq("id", testId).single(),
  );
}

export async function createTest(name: string): Promise<Test> {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const { data, error } = await supabase
    .from("tests")
    .insert({ name, slug })
    .select("id, name, slug, created_at")
    .single();
  if (error) throw new StaffApiError(error.message);
  return data as Test;
}

// --- Steps ---

export function listSteps(testId: string): Promise<Step[]> {
  return unwrap(
    supabase
      .from("steps")
      .select("id, name, order_index, required")
      .eq("test_id", testId)
      .order("order_index"),
  );
}

export async function addStep(testId: string, name: string, orderIndex: number, required = true) {
  const { error } = await supabase
    .from("steps")
    .insert({ test_id: testId, name, order_index: orderIndex, required });
  if (error) throw new StaffApiError(error.message);
}

// --- Moderators ---

export function listModerators(): Promise<Moderator[]> {
  return unwrap(
    supabase.from("profiles").select("id, full_name, email").eq("role", "moderator"),
  );
}

/** Admin-only: invites a new moderator by email via the create-moderator edge function. */
export async function inviteModerator(email: string, fullName: string) {
  const { data, error } = await supabase.functions.invoke("create-moderator", {
    body: { email, full_name: fullName },
  });
  if (error) throw new StaffApiError(error.message);
  if (data?.error) throw new StaffApiError(data.error);
}

/** The tests where the signed-in moderator has at least one assigned candidate. */
export async function listTestsForCurrentModerator(): Promise<Test[]> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data: rows, error } = await supabase
    .from("candidates")
    .select("test_id")
    .eq("moderator_id", userData.user.id);
  if (error) throw new StaffApiError(error.message);
  const testIds = [...new Set((rows ?? []).map((r) => r.test_id))];
  if (testIds.length === 0) return [];
  const { data: tests, error: testErr } = await supabase
    .from("tests")
    .select("id, name, slug, created_at")
    .in("id", testIds);
  if (testErr) throw new StaffApiError(testErr.message);
  return tests ?? [];
}

// --- Candidates ---

export async function listCandidates(testId: string): Promise<CandidateListItem[]> {
  const { data: candidates, error: candErr } = await supabase
    .from("candidates")
    .select("id, email, moderator_id, submitted, submitted_at")
    .eq("test_id", testId)
    .order("email");
  if (candErr) throw new StaffApiError(candErr.message);

  const { data: reports, error: repErr } = await supabase
    .from("step_reports")
    .select("candidate_id, step_id, outcome, saved_at, comment, evidence_path, updated_at")
    .in("candidate_id", (candidates ?? []).map((c) => c.id));
  if (repErr) throw new StaffApiError(repErr.message);

  const byCandidate = new Map<string, CandidateListItem["step_outcomes"]>();
  for (const r of reports ?? []) {
    const existing = byCandidate.get(r.candidate_id) ?? {};
    existing[r.step_id] = {
      outcome: r.outcome,
      saved_at: r.saved_at,
      comment: r.comment,
      evidence_path: r.evidence_path,
      updated_at: r.updated_at,
    };
    byCandidate.set(r.candidate_id, existing);
  }

  return (candidates ?? []).map((c) => ({
    id: c.id,
    email: c.email,
    moderator_id: c.moderator_id,
    submitted: c.submitted,
    submitted_at: c.submitted_at,
    step_outcomes: byCandidate.get(c.id) ?? {},
  }));
}

export async function addCandidate(testId: string, email: string) {
  const { error } = await supabase.from("candidates").insert({ test_id: testId, email });
  if (error) throw new StaffApiError(error.message);
}

export async function assignModerator(candidateId: string, moderatorId: string | null) {
  const { error } = await supabase
    .from("candidates")
    .update({ moderator_id: moderatorId })
    .eq("id", candidateId);
  if (error) throw new StaffApiError(error.message);
}

/** All issues logged across every candidate in a test, with their email attached -- used for CSV export. */
export async function listIssuesForTest(
  testId: string,
): Promise<(Issue & { candidate_email: string })[]> {
  const { data, error } = await supabase
    .from("issues")
    .select("id, step_id, custom_step_name, comment, evidence_path, created_at, candidates!inner(email, test_id)")
    .eq("candidates.test_id", testId);
  if (error) throw new StaffApiError(error.message);
  return (data ?? []).map((row) => {
    const { candidates, ...issue } = row as unknown as Issue & {
      candidates: { email: string };
    };
    return { ...issue, candidate_email: candidates.email };
  });
}

export async function getCandidateFull(candidateId: string): Promise<CandidateFull> {
  const { data: candidate, error: cErr } = await supabase
    .from("candidates")
    .select("id, test_id, email, moderator_id, submitted, submitted_at")
    .eq("id", candidateId)
    .single();
  if (cErr) throw new StaffApiError(cErr.message);

  const { data: step_reports, error: srErr } = await supabase
    .from("step_reports")
    .select("step_id, outcome, comment, evidence_path, saved_at")
    .eq("candidate_id", candidateId);
  if (srErr) throw new StaffApiError(srErr.message);

  const { data: issues, error: iErr } = await supabase
    .from("issues")
    .select("id, step_id, custom_step_name, comment, evidence_path, created_at")
    .eq("candidate_id", candidateId)
    .order("created_at");
  if (iErr) throw new StaffApiError(iErr.message);

  return {
    candidate,
    step_reports: (step_reports ?? []) as StepReport[],
    issues: (issues ?? []) as Issue[],
  };
}

export async function upsertStepReportStaff(
  candidateId: string,
  stepId: string,
  outcome: string | null,
  comment: string,
  evidencePath: string | null,
  stampSavedAt: boolean,
) {
  const payload: Record<string, unknown> = {
    candidate_id: candidateId,
    step_id: stepId,
    outcome,
    comment,
    evidence_path: evidencePath,
    updated_at: new Date().toISOString(),
  };
  if (stampSavedAt) payload.saved_at = new Date().toISOString();

  const { error } = await supabase
    .from("step_reports")
    .upsert(payload, { onConflict: "candidate_id,step_id" });
  if (error) throw new StaffApiError(error.message);
}

export async function addIssueStaff(
  candidateId: string,
  stepId: string | null,
  customStepName: string | null,
  comment: string,
  evidencePath: string,
) {
  const { error } = await supabase.from("issues").insert({
    candidate_id: candidateId,
    step_id: stepId,
    custom_step_name: customStepName,
    comment,
    evidence_path: evidencePath,
  });
  if (error) throw new StaffApiError(error.message);
}

export async function submitFormStaff(candidateId: string) {
  const { error } = await supabase
    .from("candidates")
    .update({ submitted: true, submitted_at: new Date().toISOString() })
    .eq("id", candidateId);
  if (error) throw new StaffApiError(error.message);
}

export async function uploadEvidenceStaff(testId: string, candidateId: string, file: File) {
  const path = `${testId}/${candidateId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("evidence").upload(path, file);
  if (error) throw new StaffApiError(error.message);
  return path;
}

/** Evidence bucket is private; staff need a signed URL to download a file. */
export async function getEvidenceDownloadUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("evidence").createSignedUrl(path, 60);
  if (error) throw new StaffApiError(error.message);
  return data.signedUrl;
}
