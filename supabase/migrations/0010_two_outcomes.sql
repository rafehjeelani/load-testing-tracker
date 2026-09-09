-- Collapses the three step outcomes (without_issues / with_issues / unable)
-- down to two (completed / unable). "With issues" is merged into
-- "completed" -- the nuance it used to carry is still available via the
-- step's own comment/evidence, which were never gated on that distinction
-- anyway.
--
-- The constraint has to drop *before* the data migration -- the old one
-- only allows without_issues/with_issues/unable, so writing 'completed'
-- while it's still in effect fails outright.
alter table step_reports drop constraint step_reports_outcome_check;

update step_reports set outcome = 'completed' where outcome in ('without_issues', 'with_issues');

alter table step_reports add constraint step_reports_outcome_check
  check (outcome in ('completed', 'unable'));
