import { supabase } from "./supabase";
import { sanitizeFilename } from "./storagePath";
import type {
  CandidateFull,
  CandidateListItem,
  Issue,
  Moderator,
  Profile,
  StaffRole,
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
  // getSession() reads the session that signInWithPassword() already
  // stored locally, synchronously -- unlike getUser(), it doesn't make its
  // own round trip to re-verify the JWT server-side, so it can't lag behind
  // a sign-in that just happened a moment ago.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, email")
    .eq("id", session.user.id)
    .single();
  // A missing row (not an admin/moderator yet) is a normal, silent "not set
  // up" state -- anything else (RLS denial, network error, etc.) is a real
  // failure the caller should be able to show to the user.
  if (error) {
    if (error.code === "PGRST116") {
      throw new StaffApiError(
        `Signed in as ${session.user.email}, but no admin/moderator profile exists for this account yet.`,
      );
    }
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

export async function updateTestName(testId: string, name: string) {
  const { error } = await supabase.from("tests").update({ name }).eq("id", testId);
  if (error) throw new StaffApiError(error.message);
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

/** Copies every step from one test into another, preserving order and required flags. */
export async function copyStepsFromTest(sourceTestId: string, destTestId: string) {
  const sourceSteps = await listSteps(sourceTestId);
  if (sourceSteps.length === 0) return;
  const { error } = await supabase.from("steps").insert(
    sourceSteps.map((s) => ({
      test_id: destTestId,
      name: s.name,
      order_index: s.order_index,
      required: s.required,
    })),
  );
  if (error) throw new StaffApiError(error.message);
}

export async function updateStep(stepId: string, patch: { name?: string; required?: boolean }) {
  const { error } = await supabase.from("steps").update(patch).eq("id", stepId);
  if (error) throw new StaffApiError(error.message);
}

export async function deleteStep(stepId: string) {
  const { error } = await supabase.from("steps").delete().eq("id", stepId);
  if (error) throw new StaffApiError(error.message);
}

/** Bulk-updates order_index for a full reordered list of steps (e.g. after a drag-and-drop). */
export async function reorderSteps(steps: { id: string; order_index: number }[]) {
  await Promise.all(
    steps.map(({ id, order_index }) =>
      supabase.from("steps").update({ order_index }).eq("id", id).then(({ error }) => {
        if (error) throw new StaffApiError(error.message);
      }),
    ),
  );
}

// --- Moderators ---

/** Admins act as moderators too, so anywhere a candidate can be assigned to
 *  "a moderator" should offer admins as well. */
export function listModerators(): Promise<Moderator[]> {
  return unwrap(
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["moderator", "admin"]),
  );
}

// supabase-js's error.message for a non-2xx Edge Function response is a
// generic "Edge Function returned a non-2xx status code" -- the actual
// reason our functions send back as JSON only lives on error.context (the
// raw Response), so it has to be read out separately.
async function invokeFunction(
  name: string,
  body: Record<string, unknown>,
): Promise<{ error?: string; link?: string }> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === "function") {
      try {
        const parsed = await context.json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // Response body wasn't JSON -- fall back to the generic message.
      }
    }
    throw new StaffApiError(message);
  }
  return data ?? {};
}

/** Admin-only: invites a new admin or moderator by email via the create-moderator edge function. */
export async function inviteStaff(email: string, fullName: string, role: StaffRole) {
  const data = await invokeFunction("create-moderator", { email, full_name: fullName, role });
  if (data.error) throw new StaffApiError(data.error);
}

// --- Users (global admin-only management, across all tests) ---

/** Every staff account (admin or moderator) in the org, alphabetical. */
export function listAllUsers(): Promise<Moderator[]> {
  return unwrap(supabase.from("profiles").select("id, full_name, email, role").order("full_name"));
}

export async function updateUserFullName(userId: string, fullName: string) {
  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
  if (error) throw new StaffApiError(error.message);
}

export async function updateUserRole(userId: string, role: StaffRole) {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) throw new StaffApiError(error.message);
}

/** Admin-only: changes a user's login email (Auth + profiles, kept in sync) via the manage-users edge function. */
export async function updateUserEmailAdmin(userId: string, email: string) {
  const data = await invokeFunction("manage-users", { action: "update_email", user_id: userId, email });
  if (data.error) throw new StaffApiError(data.error);
}

/** Admin-only: permanently deletes a user's account via the manage-users edge function. Fails with a
 *  clear message if they're still assigned as moderator on any candidate -- reassign those first. */
export async function deleteUserAdmin(userId: string) {
  const data = await invokeFunction("manage-users", { action: "delete", user_id: userId });
  if (data.error) throw new StaffApiError(data.error);
}

/** Admin-only: generates an invite link (creating the auth user + profile row) without sending an
 *  email -- sidesteps Supabase's built-in email rate limit so the admin can share it directly. */
export async function generateInviteLink(email: string, fullName: string, role: StaffRole): Promise<string> {
  const data = await invokeFunction("manage-users", {
    action: "generate_link",
    type: "invite",
    email,
    full_name: fullName,
    role,
  });
  if (data.error) throw new StaffApiError(data.error);
  return data.link!;
}

/** Admin-only: generates a password reset link for an existing user without sending an email. */
export async function generateResetLink(email: string): Promise<string> {
  const data = await invokeFunction("manage-users", { action: "generate_link", type: "recovery", email });
  if (data.error) throw new StaffApiError(data.error);
  return data.link!;
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
    .select("candidate_id, step_id, outcome, saved_at, comment, evidence_paths, updated_at")
    .in("candidate_id", (candidates ?? []).map((c) => c.id));
  if (repErr) throw new StaffApiError(repErr.message);

  const byCandidate = new Map<string, CandidateListItem["step_outcomes"]>();
  for (const r of reports ?? []) {
    const existing = byCandidate.get(r.candidate_id) ?? {};
    existing[r.step_id] = {
      outcome: r.outcome,
      saved_at: r.saved_at,
      comment: r.comment,
      evidence_paths: r.evidence_paths ?? [],
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

export async function updateCandidateEmail(candidateId: string, email: string) {
  const { error } = await supabase.from("candidates").update({ email }).eq("id", candidateId);
  if (error) throw new StaffApiError(error.message);
}

/** Cascades to that candidate's step_reports and issues (on delete cascade). */
export async function deleteCandidate(candidateId: string) {
  const { error } = await supabase.from("candidates").delete().eq("id", candidateId);
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
    .select("id, step_id, custom_step_name, comment, evidence_paths, created_at, candidates!inner(email, test_id)")
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
    .select("step_id, outcome, comment, evidence_paths, saved_at")
    .eq("candidate_id", candidateId);
  if (srErr) throw new StaffApiError(srErr.message);

  const { data: issues, error: iErr } = await supabase
    .from("issues")
    .select("id, step_id, custom_step_name, comment, evidence_paths, created_at")
    .eq("candidate_id", candidateId)
    .order("created_at");
  if (iErr) throw new StaffApiError(iErr.message);

  return {
    candidate,
    step_reports: ((step_reports ?? []) as StepReport[]).map((r) => ({ ...r, evidence_paths: r.evidence_paths ?? [] })),
    issues: (issues ?? []) as Issue[],
  };
}

export async function upsertStepReportStaff(
  candidateId: string,
  stepId: string,
  outcome: string | null,
  comment: string,
  evidencePaths: string[],
  stampSavedAt: boolean,
) {
  const payload: Record<string, unknown> = {
    candidate_id: candidateId,
    step_id: stepId,
    outcome,
    comment,
    evidence_paths: evidencePaths,
    updated_at: new Date().toISOString(),
  };
  if (stampSavedAt) payload.saved_at = new Date().toISOString();

  const { error } = await supabase
    .from("step_reports")
    .upsert(payload, { onConflict: "candidate_id,step_id" });
  if (error) throw new StaffApiError(error.message);
}

/** Lets staff manually correct the "saved at" time shown for a step (e.g. to
 *  match when the candidate says it actually happened). */
export async function updateStepReportSavedAt(candidateId: string, stepId: string, savedAtIso: string) {
  const { error } = await supabase
    .from("step_reports")
    .update({ saved_at: savedAtIso })
    .eq("candidate_id", candidateId)
    .eq("step_id", stepId);
  if (error) throw new StaffApiError(error.message);
}

export async function addIssueStaff(
  candidateId: string,
  stepId: string | null,
  customStepName: string | null,
  comment: string,
  evidencePaths: string[],
) {
  const { error } = await supabase.from("issues").insert({
    candidate_id: candidateId,
    step_id: stepId,
    custom_step_name: customStepName,
    comment,
    evidence_paths: evidencePaths,
  });
  if (error) throw new StaffApiError(error.message);
}

export async function updateIssueTimestamp(issueId: string, createdAtIso: string) {
  const { error } = await supabase.from("issues").update({ created_at: createdAtIso }).eq("id", issueId);
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
  const path = `${testId}/${candidateId}/${Date.now()}-${sanitizeFilename(file.name)}`;
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
