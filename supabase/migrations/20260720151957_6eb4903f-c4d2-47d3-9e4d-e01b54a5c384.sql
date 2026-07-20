
CREATE POLICY "Authenticated users can upload share reports"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'share-reports' AND owner = auth.uid());

CREATE POLICY "Authenticated users can read own share reports"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'share-reports' AND owner = auth.uid());

CREATE POLICY "Authenticated users can delete own share reports"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'share-reports' AND owner = auth.uid());
