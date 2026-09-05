-- The service_role key used by our Edge Functions (create-moderator,
-- manage-users) bypasses Row Level Security, but RLS bypass is separate
-- from ordinary table privileges -- and 0001_init.sql's baseline grant
-- only covered `authenticated`, never `service_role`. Every service-role
-- write to these tables (inviting a user's profile row, editing an email,
-- deleting a user, checking their assigned candidates) has therefore been
-- failing with "permission denied for table ...".
grant usage on schema public to service_role;
grant select, insert, update, delete on profiles, tests, steps, candidates, step_reports, issues to service_role;
