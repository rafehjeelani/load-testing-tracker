-- Lets a candidate un-select a step's outcome radio (going back to "not yet
-- reported") and, if the step has no comment or evidence attached, clears
-- the recorded "saved at" time along with it -- there's nothing left worth
-- timestamping. If a comment or evidence IS still present, the timestamp is
-- left exactly as it was, since real data is still attached to it.
--
-- Previously, rpc_upsert_step_report stamped saved_at to now() whenever the
-- outcome value changed at all, including changing TO null -- so unchecking
-- would have bumped the timestamp forward instead of clearing it.
create or replace function rpc_upsert_step_report(
  p_test_slug text, p_email text, p_step_id uuid,
  p_outcome text, p_comment text, p_evidence_paths text[]
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_candidate_id uuid;
  v_prev_outcome text;
  v_saved_at timestamptz;
begin
  select c.id into v_candidate_id
  from candidates c join tests t on t.id = c.test_id
  where t.slug = p_test_slug and c.email = p_email;

  if v_candidate_id is null then
    return jsonb_build_object('error', 'email_not_registered');
  end if;

  select outcome, saved_at into v_prev_outcome, v_saved_at
  from step_reports where candidate_id = v_candidate_id and step_id = p_step_id;

  if p_outcome is null
     and (p_comment is null or length(trim(p_comment)) = 0)
     and (p_evidence_paths is null or array_length(p_evidence_paths, 1) is null) then
    v_saved_at := null;
  elsif v_prev_outcome is distinct from p_outcome then
    v_saved_at := now();
  end if;

  insert into step_reports (candidate_id, step_id, outcome, comment, evidence_paths, saved_at, updated_at)
  values (v_candidate_id, p_step_id, p_outcome, p_comment, coalesce(p_evidence_paths, '{}'), v_saved_at, now())
  on conflict (candidate_id, step_id) do update
    set outcome = excluded.outcome,
        comment = excluded.comment,
        evidence_paths = excluded.evidence_paths,
        saved_at = v_saved_at,
        updated_at = now();

  return jsonb_build_object('ok', true, 'saved_at', v_saved_at);
end;
$$;
