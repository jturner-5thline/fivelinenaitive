
-- Make company-logos bucket private
UPDATE storage.buckets SET public = false WHERE id = 'company-logos';

-- Drop the old public policy
DROP POLICY IF EXISTS "Anyone can view company logos" ON storage.objects;

-- Create new policy for authenticated users only
CREATE POLICY "Authenticated users can view company logos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'company-logos');
