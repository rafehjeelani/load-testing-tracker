-- Lets an admin deactivate a staff account (blocks sign-in) without deleting
-- it or touching their existing candidate assignments -- reactivating just
-- flips this back. The actual sign-in block is enforced separately, by the
-- manage-users edge function banning the Supabase Auth user; this column is
-- what the UI reads/writes since ban status isn't queryable from the client.
alter table profiles add column active boolean not null default true;
