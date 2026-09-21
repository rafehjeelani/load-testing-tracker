-- Records which recording stream(s) -- primary, screen, and/or secondary --
-- a logged disconnection actually affected. Previously every disconnection
-- was treated as affecting all three of the Report page's duration metrics
-- uniformly, since there was no way to tell them apart. An empty array means
-- "not recorded" (every issue logged before this migration) and is treated
-- by the Report page as affecting all three streams, matching that old
-- uniform behavior -- only newly-logged issues narrow it down.
alter table issues add column disconnected_streams text[] not null default '{}';
alter table issues add constraint issues_disconnected_streams_valid
  check (disconnected_streams <@ array['primary', 'screen', 'secondary']::text[]);

-- rpc_add_issue's parameter list is changing (a new p_disconnected_streams
-- arg), which create or replace can't do across a signature change.
drop function if exists rpc_add_issue(text, text, uuid, text, text, text[]);

-- Requires at least one stream, mirroring the existing comment/evidence
-- requirements, and stores it alongside the rest of the issue.
create function rpc_add_issue(
  p_test_slug text, p_email text, p_step_id uuid, p_custom_step_name text,
  p_comment text, p_evidence_paths text[], p_disconnected_streams text[]
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
  if p_disconnected_streams is null or array_length(p_disconnected_streams, 1) is null then
    return jsonb_build_object('error', 'streams_required');
  end if;

  select c.id into v_candidate_id
  from candidates c join tests t on t.id = c.test_id
  where t.slug = p_test_slug and c.email = p_email;

  if v_candidate_id is null then
    return jsonb_build_object('error', 'email_not_registered');
  end if;

  insert into issues (candidate_id, step_id, custom_step_name, comment, evidence_paths, disconnected_streams)
  values (v_candidate_id, p_step_id, p_custom_step_name, p_comment, p_evidence_paths, p_disconnected_streams);

  update candidates set current_attempt = current_attempt + 1 where id = v_candidate_id;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function rpc_add_issue(text, text, uuid, text, text, text[], text[]) to anon;

-- rpc_get_candidate_state now hands disconnected_streams back too, so the
-- candidate session can keep its local issues list in sync after logging one.
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
        'comment', i.comment, 'evidence_paths', i.evidence_paths,
        'disconnected_streams', i.disconnected_streams, 'created_at', i.created_at
      ) order by i.created_at), '[]'::jsonb)
      from issues i where i.candidate_id = v_candidate.id
    )
  );
end;
$$;
