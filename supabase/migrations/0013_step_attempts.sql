-- Lets a step be answered more than once across a candidate's session: a
-- disconnection increments the candidate's current_attempt, and every step
-- save from that point on writes a NEW row (a fresh timestamp, visible on
-- the Session Timeline) instead of overwriting the prior attempt's answer,
-- which stays exactly as it was. The candidate's own view (and every
-- "current status" admin view -- Candidates table, funnel, step-level
-- performance, staff editing) only ever shows the CURRENT attempt's row for
-- a step, treating a step with no row yet in this attempt as "not yet
-- reported" -- even if an earlier attempt answered it. Only the Session
-- Timeline, which is explicitly about chronological activity rather than
-- current status, shows every attempt.
alter table candidates add column current_attempt integer not null default 1;
alter table step_reports add column attempt integer not null default 1;

alter table step_reports drop constraint step_reports_candidate_id_step_id_key;
alter table step_reports add constraint step_reports_candidate_id_step_id_attempt_key
  unique (candidate_id, step_id, attempt);

-- step_reports now scoped to the candidate's current attempt, except the
-- network-check step, which is exempt from the attempt reset entirely (it's
-- a once-ever gate, never repeated after a disconnection).
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

-- Writes now target the candidate's CURRENT attempt: editing an
-- already-saved step within the same attempt still updates that one row
-- (via the new 3-column conflict target); a save made after a disconnection
-- targets a fresh attempt number and so becomes a new row instead.
create or replace function rpc_upsert_step_report(
  p_test_slug text, p_email text, p_step_id uuid,
  p_outcome text, p_comment text, p_evidence_paths text[]
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_candidate candidates%rowtype;
  v_prev_outcome text;
  v_saved_at timestamptz;
begin
  select c.* into v_candidate
  from candidates c join tests t on t.id = c.test_id
  where t.slug = p_test_slug and c.email = p_email;

  if v_candidate.id is null then
    return jsonb_build_object('error', 'email_not_registered');
  end if;

  select outcome, saved_at into v_prev_outcome, v_saved_at
  from step_reports
  where candidate_id = v_candidate.id and step_id = p_step_id and attempt = v_candidate.current_attempt;

  if p_outcome is null
     and (p_comment is null or length(trim(p_comment)) = 0)
     and (p_evidence_paths is null or array_length(p_evidence_paths, 1) is null) then
    v_saved_at := null;
  elsif v_prev_outcome is distinct from p_outcome then
    v_saved_at := now();
  end if;

  insert into step_reports (candidate_id, step_id, attempt, outcome, comment, evidence_paths, saved_at, updated_at)
  values (v_candidate.id, p_step_id, v_candidate.current_attempt, p_outcome, p_comment, coalesce(p_evidence_paths, '{}'), v_saved_at, now())
  on conflict (candidate_id, step_id, attempt) do update
    set outcome = excluded.outcome,
        comment = excluded.comment,
        evidence_paths = excluded.evidence_paths,
        saved_at = v_saved_at,
        updated_at = now();

  return jsonb_build_object('ok', true, 'saved_at', v_saved_at);
end;
$$;

-- Scope the "correct the saved-at time" RPC to the current attempt's row.
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

  update step_reports
  set saved_at = p_saved_at
  where candidate_id = v_candidate.id
    and step_id = p_step_id
    and attempt = v_candidate.current_attempt
    and outcome is not null;

  if not found then
    return jsonb_build_object('error', 'step_not_reported');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- Every candidate-logged issue is a Disconnection now (the button was
-- relabeled) -- logging one starts a fresh attempt, so the next save for
-- any step becomes a new, separately-timestamped entry.
create or replace function rpc_add_issue(
  p_test_slug text, p_email text, p_step_id uuid, p_custom_step_name text,
  p_comment text, p_evidence_paths text[]
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_candidate_id uuid;
begin
  if p_comment is null or length(trim(p_comment)) = 0 then
    return jsonb_build_object('error', 'comment_required');
  end if;
  if p_evidence_paths is null or array_length(p_evidence_paths, 1) is null then
    return jsonb_build_object('error', 'evidence_required');
  end if;

  select c.id into v_candidate_id
  from candidates c join tests t on t.id = c.test_id
  where t.slug = p_test_slug and c.email = p_email;

  if v_candidate_id is null then
    return jsonb_build_object('error', 'email_not_registered');
  end if;

  insert into issues (candidate_id, step_id, custom_step_name, comment, evidence_paths)
  values (v_candidate_id, p_step_id, p_custom_step_name, p_comment, p_evidence_paths);

  update candidates set current_attempt = current_attempt + 1 where id = v_candidate_id;

  return jsonb_build_object('ok', true);
end;
$$;
