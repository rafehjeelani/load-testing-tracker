-- Allow up to 5 evidence files per step report / issue, instead of exactly
-- one. Converts the existing single-path columns to arrays, migrating any
-- data already present, then rebuilds the RPC functions (parameter types
-- can't be changed in place with `create or replace`, so these are
-- dropped and recreated).

alter table step_reports add column evidence_paths text[] not null default '{}';
update step_reports set evidence_paths = case when evidence_path is not null then array[evidence_path] else '{}'::text[] end;
alter table step_reports drop column evidence_path;
alter table step_reports add constraint step_reports_evidence_max5
  check (array_length(evidence_paths, 1) is null or array_length(evidence_paths, 1) <= 5);

alter table issues add column evidence_paths text[];
update issues set evidence_paths = array[evidence_path];
alter table issues alter column evidence_paths set not null;
alter table issues drop column evidence_path;
alter table issues add constraint issues_evidence_between_1_5
  check (array_length(evidence_paths, 1) between 1 and 5);

drop function if exists rpc_get_candidate_state(text, text);
create function rpc_get_candidate_state(p_test_slug text, p_email text)
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
      'submitted', v_candidate.submitted, 'submitted_at', v_candidate.submitted_at
    ),
    'steps', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'order_index', s.order_index, 'required', s.required
      ) order by s.order_index), '[]'::jsonb)
      from steps s where s.test_id = v_test.id
    ),
    'step_reports', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'step_id', sr.step_id, 'outcome', sr.outcome, 'comment', sr.comment,
        'evidence_paths', sr.evidence_paths, 'saved_at', sr.saved_at
      )), '[]'::jsonb)
      from step_reports sr where sr.candidate_id = v_candidate.id
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

drop function if exists rpc_upsert_step_report(text, text, uuid, text, text, text);
create function rpc_upsert_step_report(
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

  if v_prev_outcome is distinct from p_outcome then
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

drop function if exists rpc_add_issue(text, text, uuid, text, text, text);
create function rpc_add_issue(
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

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function rpc_get_candidate_state(text, text) to anon;
grant execute on function rpc_upsert_step_report(text, text, uuid, text, text, text[]) to anon;
grant execute on function rpc_add_issue(text, text, uuid, text, text, text[]) to anon;
