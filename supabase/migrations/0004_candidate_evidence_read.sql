-- Lets candidates view/download evidence they (or another candidate on the
-- same test) previously submitted, once the page has been reloaded and the
-- transient local (object-URL) preview is gone.
--
-- Tradeoff, chosen deliberately over a scoped/verified RPC: this makes the
-- whole `evidence` bucket readable by anyone who has (or guesses) an object
-- path -- there's no per-candidate identity check, since anon requests have
-- no session to check against. Paths are unguessable in practice (test
-- slug/email/timestamp-filename), but this is not the same guarantee as
-- "only that candidate can read their own file."
create policy "evidence: anon can read" on storage.objects
  for select to anon
  using (bucket_id = 'evidence');
