-- Lets candidates correct the time recorded against their own step outcomes
-- and logged issues/disconnections -- mirrors the capability staff already
-- have (StaffStepRow's "Edit time", IssuesSection's onEditTime), since
-- candidates often fill the form retrospectively (e.g. right after
-- reconnecting) and the real event time isn't "now". Same security pattern
-- as every other candidate RPC: re-verify the email against the test/
-- candidate row on every call, since these are called with the anon key.

create function rpc_edit_step_saved_at(p_test_slug text, p_email text, p_step_id uuid, p_saved_at timestamptz)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_candidate_id uuid;
begin
  select c.id into v_candidate_id
  from candidates c join tests t on t.id = c.test_id
  where t.slug = p_test_slug and c.email = p_email;

  if v_candidate_id is null then
    return jsonb_build_object('error', 'email_not_registered');
  end if;

  update step_reports
  set saved_at = p_saved_at
  where candidate_id = v_candidate_id and step_id = p_step_id and outcome is not null;

  if not found then
    return jsonb_build_object('error', 'step_not_reported');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create function rpc_edit_issue_created_at(p_test_slug text, p_email text, p_issue_id uuid, p_created_at timestamptz)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_candidate_id uuid;
begin
  select c.id into v_candidate_id
  from candidates c join tests t on t.id = c.test_id
  where t.slug = p_test_slug and c.email = p_email;

  if v_candidate_id is null then
    return jsonb_build_object('error', 'email_not_registered');
  end if;

  -- Scoped to this candidate's own issues -- prevents editing another
  -- candidate's entry by guessing/reusing an issue id.
  update issues
  set created_at = p_created_at
  where id = p_issue_id and candidate_id = v_candidate_id;

  if not found then
    return jsonb_build_object('error', 'issue_not_found');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function rpc_edit_step_saved_at(text, text, uuid, timestamptz) to anon;
grant execute on function rpc_edit_issue_created_at(text, text, uuid, timestamptz) to anon;
