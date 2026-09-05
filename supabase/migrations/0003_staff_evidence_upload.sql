-- The original evidence bucket policy only granted `anon` INSERT, even
-- though staff ("edit on behalf of" screens) also upload evidence directly
-- as an authenticated user -- so every staff-side evidence upload has been
-- silently rejected by RLS since the bucket was created.
create policy "evidence: staff can upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'evidence');
