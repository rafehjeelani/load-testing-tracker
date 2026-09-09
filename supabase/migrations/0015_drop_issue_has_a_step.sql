-- An issue/disconnection no longer requires a step attribution -- position
-- in the Session Log now shows which step it followed instead. Drops the
-- check constraint that required step_id or custom_step_name to be set,
-- which otherwise rejects every new issue now that the Step field is gone
-- from the modal. Existing rows that do have a step keep it (nothing here
-- touches existing data), it's just no longer required going forward.
alter table issues drop constraint issue_has_a_step;
