import { supabase } from "./supabase";
import { sanitizeFilename } from "./storagePath";
import type { CandidateState, Outcome } from "../types";

export class CandidateApiError extends Error {}

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new CandidateApiError(error.message);
  if (data && typeof data === "object" && "error" in data) {
    throw new CandidateApiError((data as { error: string }).error);
  }
  return data as T;
}

export function getCandidateState(testSlug: string, email: string) {
  return callRpc<CandidateState>("rpc_get_candidate_state", {
    p_test_slug: testSlug,
    p_email: email,
  });
}

export function upsertStepReport(
  testSlug: string,
  email: string,
  stepId: string,
  outcome: Outcome | null,
  comment: string,
  evidencePaths: string[],
) {
  return callRpc<{ ok: true; saved_at: string | null }>("rpc_upsert_step_report", {
    p_test_slug: testSlug,
    p_email: email,
    p_step_id: stepId,
    p_outcome: outcome,
    p_comment: comment,
    p_evidence_paths: evidencePaths,
  });
}

export function addIssue(
  testSlug: string,
  email: string,
  stepId: string | null,
  customStepName: string | null,
  comment: string,
  evidencePaths: string[],
) {
  return callRpc<{ ok: true }>("rpc_add_issue", {
    p_test_slug: testSlug,
    p_email: email,
    p_step_id: stepId,
    p_custom_step_name: customStepName,
    p_comment: comment,
    p_evidence_paths: evidencePaths,
  });
}

export function submitForm(testSlug: string, email: string) {
  return callRpc<{ ok: true }>("rpc_submit_form", {
    p_test_slug: testSlug,
    p_email: email,
  });
}

/** Uploads a file to the `evidence` bucket and returns its storage path. */
export async function uploadEvidence(
  testSlug: string,
  email: string,
  file: File,
): Promise<string> {
  const safeEmail = email.replace(/[^a-zA-Z0-9]/g, "_");
  const path = `${testSlug}/${safeEmail}/${Date.now()}-${sanitizeFilename(file.name)}`;
  const { error } = await supabase.storage.from("evidence").upload(path, file);
  if (error) throw new CandidateApiError(error.message);
  return path;
}

/** Signed URL so a candidate can view/download evidence they submitted in an
 *  earlier page load (once the transient local preview is gone). */
export async function getEvidenceViewUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("evidence").createSignedUrl(path, 60);
  if (error) throw new CandidateApiError(error.message);
  return data.signedUrl;
}
