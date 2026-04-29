-- Public bucket for inline signature images (logos, headshots, etc.)
insert into storage.buckets (id, name, public)
values ('email-signatures', 'email-signatures', true)
on conflict (id) do nothing;

-- Anyone can read (signature images are embedded in emails sent to recipients).
create policy "Public read for email-signatures"
on storage.objects
for select
using (bucket_id = 'email-signatures');

-- Authenticated users can upload to their own folder: <user_id>/...
create policy "Users upload own email-signature images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'email-signatures'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Authenticated users can replace files in their own folder.
create policy "Users update own email-signature images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'email-signatures'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Authenticated users can delete from their own folder.
create policy "Users delete own email-signature images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'email-signatures'
  and auth.uid()::text = (storage.foldername(name))[1]
);