-- Create the deal-files storage bucket for persisting uploaded financial files
INSERT INTO storage.buckets (id, name, public)
VALUES ('deal-files', 'deal-files', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Authenticated users can upload files
CREATE POLICY "Authenticated users can upload deal files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'deal-files');

-- RLS: Authenticated users can read deal files
CREATE POLICY "Authenticated users can read deal files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'deal-files');

-- RLS: Authenticated users can update their deal files
CREATE POLICY "Authenticated users can update deal files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'deal-files');

-- RLS: Authenticated users can delete deal files
CREATE POLICY "Authenticated users can delete deal files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'deal-files');