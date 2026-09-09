-- Adds `step_report_history` to rpc_get_candidate_state's payload: every
-- step_reports row across every attempt (excluding the network check, which
-- isn't part of the ordinary step sequence), so the candidate's own Preview
-- can render a chronological "Session Log" -- step 1, step 2, disconnection,
-- step 1 (again), step 2 (again), etc -- instead of only showing the
-- current attempt's status. The existing `step_reports` key is untouched,
-- since the per-step "what to answer now" cards still need only the
-- current attempt.
create or replace function rpc_get_candidate_state(p_test_slug text, p_email text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_test tests%rowtype;
  v_candidate candidates%rowtype;
begin
  select * into v_test from tests where slug = p_test_slug;
  if not found then
    return jsonb_build_object('error', 'test_not_found');
  end if;

  select * into v_candidate from candidates where test_id = v_test.id and email = p_email;
  if not found then
    return jsonb_build_object('error', 'email_not_registered');
  end if;

  return jsonb_build_object(
    'test', jsonb_build_object('id', v_test.id, 'name', v_test.name),
    'candidate', jsonb_build_object(
      'id', v_candidate.id, 'email', v_candidate.email,
      'submitted', v_candidate.submitted, 'submitted_at', v_candidate.submitted_at,
      'current_attempt', v_candidate.current_attempt
    ),
    'steps', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'order_index', s.order_index, 'required', s.required,
        'is_network_check', s.is_network_check
      ) order by s.order_index), '[]'::jsonb)
      from steps s where s.test_id = v_test.id
    ),
    'step_reports', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'step_id', sr.step_id, 'outcome', sr.outcome, 'comment', sr.comment,
        'evidence_paths', sr.evidence_paths, 'saved_at', sr.saved_at, 'attempt', sr.attempt
      )), '[]'::jsonb)
      from step_reports sr
      join steps s on s.id = sr.step_id
      where sr.candidate_id = v_candidate.id
        and (s.is_network_check or sr.attempt = v_candidate.current_attempt)
    ),
    'step_report_history', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'step_id', sr.step_id, 'outcome', sr.outcome, 'saved_at', sr.saved_at, 'attempt', sr.attempt
      ) order by sr.saved_at), '[]'::jsonb)
      from step_reports sr
      join steps s on s.id = sr.step_id
      where sr.candidate_id = v_candidate.id
        and not s.is_network_check
        and sr.saved_at is not null
    ),
    'issues', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'step_id', i.step_id, 'custom_step_name', i.custom_step_name,
        'comment', i.comment, 'evidence_paths', i.evidence_paths, 'created_at', i.created_at
      ) order by i.created_at), '[]'::jsonb)
      from issues i where i.candidate_id = v_candidate.id
    )
  );
end;
$$;
