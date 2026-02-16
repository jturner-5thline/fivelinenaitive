
-- Fix 1: Deal-space storage - implement deal-scoped access control
DROP POLICY IF EXISTS "Users can view deal space files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload deal space files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete deal space files" ON storage.objects;

-- Users can view deal-space files only for deals they have access to
CREATE POLICY "Users can view deal space files for accessible deals"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'deal-space' 
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id::text = (storage.foldername(name))[1]
    AND (
      d.user_id = auth.uid()
      OR public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  )
);

-- Users can upload to deal-space only for deals they have access to
CREATE POLICY "Users can upload to accessible deal folders"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'deal-space'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id::text = (storage.foldername(name))[1]
    AND (
      d.user_id = auth.uid()
      OR public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  )
);

-- Users can update deal-space files only for deals they have access to
CREATE POLICY "Users can update files in accessible deals"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'deal-space'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id::text = (storage.foldername(name))[1]
    AND (
      d.user_id = auth.uid()
      OR public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  )
);

-- Users can delete deal-space files only for deals they have access to
CREATE POLICY "Users can delete files from accessible deals"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'deal-space'
  AND auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id::text = (storage.foldername(name))[1]
    AND (
      d.user_id = auth.uid()
      OR public.is_same_company_as_user(auth.uid(), d.user_id)
    )
  )
);

-- Fix 2: Recreate profiles_public view with security_invoker=true
-- The view intentionally excludes sensitive PII, so security_invoker is safe here
-- We need a security definer function to allow cross-company visibility of non-sensitive fields
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public
WITH (security_invoker=true) AS
SELECT 
  id,
  user_id,
  display_name,
  first_name,
  last_name,
  avatar_url,
  created_at,
  onboarding_completed
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;

COMMENT ON VIEW public.profiles_public IS 'Safe public view of profiles excluding sensitive PII (phone, emails, etc). Uses security_invoker=true so RLS on profiles table applies.';

-- We need a SELECT policy on profiles that allows authenticated users to see
-- basic non-sensitive fields of company members. Since the view now uses security_invoker,
-- we need to ensure profiles RLS allows reading teammate profiles.
-- Check if a policy already exists for company member visibility:
CREATE POLICY "Users can view profiles of company members via view"
ON public.profiles FOR SELECT
USING (
  auth.uid() = user_id
  OR public.is_same_company_as_user(auth.uid(), user_id)
  OR public.is_admin(auth.uid())
);
