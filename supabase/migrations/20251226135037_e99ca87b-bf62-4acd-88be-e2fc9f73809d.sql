-- Make deal-attachments and avatars buckets private
UPDATE storage.buckets SET public = false WHERE id = 'deal-attachments';
UPDATE storage.buckets SET public = false WHERE id = 'avatars';