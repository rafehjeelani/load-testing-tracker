-- A disconnection used to reset every step's "current" view to blank
-- (candidates.current_attempt bumps, and the current view was strictly
-- "attempt = current_attempt") -- meaning the candidate had to re-pick an
-- outcome for every already-answered step all over again just to get back
-- to where they'd actually been disconnected, even though, on the real
-- assessment platform, most steps DON'T actually repeat on a reconnect
-- (only some do, and which ones varies by disconnect -- there's no fixed
-- list). So instead: "current status" for a step is now its most recent
-- row across every attempt, not strictly the latest attempt's own row. An
-- untouched step after a disconnection keeps showing its last real answer
-- (nothing forces a re-pick); a step the candidate does touch still writes
-- a genuinely new, separately-timestamped row under the new attempt, same
-- as before. This changes nothing about step_report_history (the full
-- per-attempt log behind the Session Log/Report timeline) -- only what
-- counts as "current."
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
        'step_id', latest.step_id, 'outcome', latest.outcome, 'comment', latest.comment,
        'evidence_paths', latest.evidence_paths, 'saved_at', latest.saved_at, 'attempt', latest.attempt
      )), '[]'::jsonb)
      from (
        select distinct on (sr.step_id)
          sr.step_id, sr.outcome, sr.comment, sr.evidence_paths, sr.saved_at, sr.attempt
        from step_reports sr
        where sr.candidate_id = v_candidate.id
        order by sr.step_id, sr.attempt desc
      ) latest
    ),
    'step_report_history', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'step_id', sr.step_id, 'outcome', sr.outcome, 'comment', sr.comment,
        'evidence_paths', sr.evidence_paths, 'saved_at', sr.saved_at, 'attempt', sr.attempt
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

-- "Edit saved-at time" now targets whichever row is actually current (the
-- latest attempt for that step), matching the same carry-forward rule --
-- previously it only looked at attempt = current_attempt, which would
-- fail with "step_not_reported" for a step that's showing carried-forward
-- data but hasn't been touched in the new attempt yet.
create or replace function rpc_edit_step_saved_at(p_test_slug text, p_email text, p_step_id uuid, p_saved_at timestamptz)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_candidate candidates%rowtype;
begin
  select c.* into v_candidate
  from candidates c join tests t on t.id = c.test_id
  where t.slug = p_test_slug and c.email = p_email;

  if v_candidate.id is null then
    return jsonb_build_object('error', 'email_not_registered');
  end if;

  update step_reports sr
  set saved_at = p_saved_at
  where sr.candidate_id = v_candidate.id
    and sr.step_id = p_step_id
    and sr.outcome is not null
    and sr.attempt = (
      select max(attempt) from step_reports
      where candidate_id = v_candidate.id and step_id = p_step_id
    );

  if not found then
    return jsonb_build_object('error', 'step_not_reported');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
