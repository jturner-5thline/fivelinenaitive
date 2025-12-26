-- Make lender-attachments bucket private
UPDATE storage.buckets SET public = false WHERE id = 'lender-attachments';