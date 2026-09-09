-- Fixes a pre-existing bug (surfaced by testing this session's work, not
-- caused by it): deleting a test cascades to its candidates, which cascades
-- to their issues (issues.candidate_id already has on delete cascade) --
-- but it also cascades to that test's steps, and issues.step_id had no
-- delete action at all. Deleting a test with a candidate whose logged issue
-- referenced a specific step failed outright ("violates foreign key
-- constraint issues_step_id_fkey"), because Postgres can hit the step-side
-- FK before the candidate-side cascade has removed the referencing row.
-- The issue row is going to be deleted either way in that scenario (via the
-- candidate cascade) -- this just lets that resolve regardless of order.
alter table issues drop constraint issues_step_id_fkey;
alter table issues add constraint issues_step_id_fkey
  foreign key (step_id) references steps (id) on delete cascade;
