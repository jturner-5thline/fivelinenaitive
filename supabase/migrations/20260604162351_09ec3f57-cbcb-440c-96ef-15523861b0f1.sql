
-- RLS policies for insights-attachments bucket.
-- Path convention: {company_id}/{configKey}/{uuid}.{ext}
-- First path segment is the company_id (uuid); access is gated by company membership.

CREATE POLICY "Company members can view insights attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'insights-attachments'
  AND public.is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Company members can upload insights attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'insights-attachments'
  AND public.is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Company members can update insights attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'insights-attachments'
  AND public.is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'insights-attachments'
  AND public.is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Company members can delete insights attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'insights-attachments'
  AND public.is_company_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
