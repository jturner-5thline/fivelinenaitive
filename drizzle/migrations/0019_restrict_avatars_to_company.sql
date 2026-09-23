DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
CREATE POLICY "Avatars visible to own company" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars' AND (
    (storage.foldername(name))[1] = (select auth.uid())::text
    OR public.is_same_company_as_user((select auth.uid()), ((storage.foldername(name))[1])::uuid)
  )
);