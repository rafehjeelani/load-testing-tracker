-- The network check becomes a fixed, non-admin-configurable check every
-- candidate does once, before the regular step wizard -- not something an
-- admin adds/edits/reorders like a normal step. Rather than a parallel data
-- model, it's just an ordinary `steps` row flagged to be excluded from every
-- regular step listing (admin Steps page, per-step report columns, the
-- candidate wizard/dropdown/preview) -- it reuses the exact same
-- evidence/comment/timestamp machinery as any other step, unchanged.
alter table steps add column is_network_check boolean not null default false;

-- Preserve real history: for each test, if an existing step literally named
-- "Network test" is already the first step, flag that row in place instead
-- of creating a duplicate -- its candidates' existing step_reports (and
-- timestamps) carry over untouched.
with first_steps as (
  select distinct on (test_id) id, test_id, name
  from steps
  order by test_id, order_index
)
update steps
set is_network_check = true
where id in (select id from first_steps where lower(trim(name)) = 'network test');

-- Every other test (none of whose first step matched that name) gets a
-- fresh one. order_index -1 never collides -- every real step's order_index
-- starts at 1 (see src/routes/admin/Steps.tsx).
insert into steps (test_id, name, order_index, required, is_network_check)
select t.id, 'Network Check', -1, true, true
from tests t
where not exists (
  select 1 from steps s where s.test_id = t.id and s.is_network_check = true
);

-- rpc_get_candidate_state needs to hand back is_network_check per step so
-- the candidate app can find the gate step and exclude it from the regular
-- wizard/dropdown/preview list.
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
      'submitted', v_candidate.submitted, 'submitted_at', v_candidate.submitted_at
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
