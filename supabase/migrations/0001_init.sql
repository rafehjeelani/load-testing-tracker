-- Load Testing Tracker: initial schema
-- Admins and moderators are real Supabase Auth users (see `profiles`).
-- Candidates are NOT authenticated: they identify themselves by email only,
-- matched against the `candidates` row an admin created for that test.
-- All candidate reads/writes therefore go through the SECURITY DEFINER
-- functions at the bottom of this file (called with the `anon` key from the
-- public candidate form), which re-verify the email on every call. This is a
-- deliberately lightweight gate matching the approved mockup (no OTP/login
-- step for candidates) -- anyone who knows a candidate's registered email
-- can view/edit that candidate's submission. Flagged here so it's a known,
-- documented trade-off rather than an accident.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles (admins & moderators)
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  full_name text not null,
  created_at timestamptz not null default now()
);

create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- tests
-- ---------------------------------------------------------------------
create table tests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- steps (configured per test, drive both the candidate form and the report)
-- ---------------------------------------------------------------------
create table steps (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references tests (id) on delete cascade,
  name text not null,
  order_index int not null,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (test_id, order_index)
);

-- ---------------------------------------------------------------------
-- candidates (identified by email within a test, not Supabase Auth users)
-- ---------------------------------------------------------------------
create table candidates (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references tests (id) on delete cascade,
  email citext not null,
  moderator_id uuid references profiles (id),
  submitted boolean not null default false,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (test_id, email)
);

create extension if not exists citext;

-- ---------------------------------------------------------------------
-- step_reports (one row per candidate per step; the 3-way outcome)
-- ---------------------------------------------------------------------
create table step_reports (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  step_id uuid not null references steps (id) on delete cascade,
  outcome text check (outcome in ('without_issues', 'with_issues', 'unable')),
  comment text,
  evidence_path text,
  saved_at timestamptz, -- stamped only when `outcome` changes (see rpc below)
  updated_at timestamptz not null default now(),
  unique (candidate_id, step_id)
);

-- ---------------------------------------------------------------------
-- issues (free-standing issue/disconnection log, separate from step_reports)
-- ---------------------------------------------------------------------
create table issues (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates (id) on delete cascade,
  step_id uuid references steps (id), -- null when custom_step_name is used ("Other")
  custom_step_name text,
  comment text not null,
  evidence_path text not null,
  created_at timestamptz not null default now(),
  constraint issue_has_a_step check (step_id is not null or custom_step_name is not null)
);

-- ---------------------------------------------------------------------
-- Row Level Security: admins/moderators (authenticated), scoped by role
-- ---------------------------------------------------------------------
alter table profiles enable row level security;
alter table tests enable row level security;
alter table steps enable row level security;
alter table candidates enable row level security;
alter table step_reports enable row level security;
alter table issues enable row level security;

create policy "profiles: read own or admin reads all" on profiles
  for select using (id = auth.uid() or is_admin());
create policy "profiles: admin manages all" on profiles
  for all using (is_admin()) with check (is_admin());

create policy "tests: any staff can read" on tests
  for select using (auth.role() = 'authenticated');
create policy "tests: admin manages" on tests
  for all using (is_admin()) with check (is_admin());

create policy "steps: any staff can read" on steps
  for select using (auth.role() = 'authenticated');
create policy "steps: admin manages" on steps
  for all using (is_admin()) with check (is_admin());

create policy "candidates: admin manages all" on candidates
  for all using (is_admin()) with check (is_admin());
create policy "candidates: moderator reads/updates own assignment" on candidates
  for select using (moderator_id = auth.uid());
create policy "candidates: moderator updates own assignment" on candidates
  for update using (moderator_id = auth.uid()) with check (moderator_id = auth.uid());

create policy "step_reports: admin manages all" on step_reports
  for all using (is_admin()) with check (is_admin());
create policy "step_reports: moderator manages own candidates" on step_reports
  for all using (
    exists (select 1 from candidates c where c.id = candidate_id and c.moderator_id = auth.uid())
  ) with check (
    exists (select 1 from candidates c where c.id = candidate_id and c.moderator_id = auth.uid())
  );

create policy "issues: admin manages all" on issues
  for all using (is_admin()) with check (is_admin());
create policy "issues: moderator manages own candidates" on issues
  for all using (
    exists (select 1 from candidates c where c.id = candidate_id and c.moderator_id = auth.uid())
  ) with check (
    exists (select 1 from candidates c where c.id = candidate_id and c.moderator_id = auth.uid())
  );

-- No policies for `anon` on these tables by design -- the public candidate
-- form only ever talks to the SECURITY DEFINER functions below, never to
-- the tables directly.

-- ---------------------------------------------------------------------
-- Candidate-facing RPCs (callable with the public anon key; re-verify
-- test slug + email on every call instead of trusting a stored session)
-- ---------------------------------------------------------------------

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
        'id', s.id, 'name', s.name, 'order_index', s.order_index, 'required', s.required
      ) order by s.order_index), '[]'::jsonb)
      from steps s where s.test_id = v_test.id
    ),
    'step_reports', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'step_id', sr.step_id, 'outcome', sr.outcome, 'comment', sr.comment,
        'evidence_path', sr.evidence_path, 'saved_at', sr.saved_at
      )), '[]'::jsonb)
      from step_reports sr where sr.candidate_id = v_candidate.id
    ),
    'issues', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'step_id', i.step_id, 'custom_step_name', i.custom_step_name,
        'comment', i.comment, 'evidence_path', i.evidence_path, 'created_at', i.created_at
      ) order by i.created_at), '[]'::jsonb)
      from issues i where i.candidate_id = v_candidate.id
    )
  );
end;
$$;

create or replace function rpc_upsert_step_report(
  p_test_slug text, p_email text, p_step_id uuid,
  p_outcome text, p_comment text, p_evidence_path text
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

  -- timestamp reflects when the outcome (radio) was picked, not comment/evidence edits
  if v_prev_outcome is distinct from p_outcome then
    v_saved_at := now();
  end if;

  insert into step_reports (candidate_id, step_id, outcome, comment, evidence_path, saved_at, updated_at)
  values (v_candidate_id, p_step_id, p_outcome, p_comment, p_evidence_path, v_saved_at, now())
  on conflict (candidate_id, step_id) do update
    set outcome = excluded.outcome,
        comment = excluded.comment,
        evidence_path = excluded.evidence_path,
        saved_at = v_saved_at,
        updated_at = now();

  return jsonb_build_object('ok', true, 'saved_at', v_saved_at);
end;
$$;

create or replace function rpc_add_issue(
  p_test_slug text, p_email text, p_step_id uuid, p_custom_step_name text,
  p_comment text, p_evidence_path text
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
  if p_evidence_path is null or length(trim(p_evidence_path)) = 0 then
    return jsonb_build_object('error', 'evidence_required');
  end if;

  select c.id into v_candidate_id
  from candidates c join tests t on t.id = c.test_id
  where t.slug = p_test_slug and c.email = p_email;

  if v_candidate_id is null then
    return jsonb_build_object('error', 'email_not_registered');
  end if;

  insert into issues (candidate_id, step_id, custom_step_name, comment, evidence_path)
  values (v_candidate_id, p_step_id, p_custom_step_name, p_comment, p_evidence_path);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function rpc_submit_form(p_test_slug text, p_email text)
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

  update candidates set submitted = true, submitted_at = now() where id = v_candidate_id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function rpc_get_candidate_state(text, text) to anon;
grant execute on function rpc_upsert_step_report(text, text, uuid, text, text, text) to anon;
grant execute on function rpc_add_issue(text, text, uuid, text, text, text) to anon;
grant execute on function rpc_submit_form(text, text) to anon;

-- ---------------------------------------------------------------------
-- Storage: evidence bucket
-- Uploads happen from both the unauthenticated candidate form (anon) and
-- the authenticated admin/moderator "edit on behalf of" screens, so the
-- bucket accepts anon inserts (same trade-off as the RPCs above: this is
-- not per-candidate-scoped at the storage layer). Reads require staff auth
-- so the "Download evidence" affordance in the admin/moderator views works,
-- but the raw file isn't publicly browsable.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

create policy "evidence: anon can upload" on storage.objects
  for insert to anon
  with check (bucket_id = 'evidence');

create policy "evidence: staff can read" on storage.objects
  for select to authenticated
  using (bucket_id = 'evidence');
