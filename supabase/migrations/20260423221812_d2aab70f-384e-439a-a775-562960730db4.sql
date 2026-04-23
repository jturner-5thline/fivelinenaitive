
-- Create private storage bucket for in-progress email attachments uploaded from the compose dialog
insert into storage.buckets (id, name, public)
values ('email-attachments', 'email-attachments', false)
on conflict (id) do nothing;

-- RLS: each authenticated user can only operate on files inside a folder named after their own user id
-- Folder convention: <user_id>/<draft_or_thread_id>/<uuid>-<filename>

create policy "Users can upload their own email attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'email-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can read their own email attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'email-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update their own email attachments"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'email-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own email attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'email-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);
