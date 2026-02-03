-- Fix profiles_public view to allow authenticated users to see teammate profiles
-- The view was using security_invoker which inherits RLS from profiles table
-- This prevented users from seeing teammate names/avatars

-- Drop the existing view
DROP VIEW IF EXISTS public.profiles_public;

-- Recreate without security_invoker (uses security_definer by default)
-- This allows authenticated users to see public profile fields of all users
CREATE VIEW public.profiles_public AS
SELECT 
  id,
  user_id,
  display_name,
  first_name,
  last_name,
  avatar_url,
  company_name,
  company_role,
  created_at
  -- Explicitly EXCLUDES: phone, backup_email, email, company_url, company_size
  -- and all notification preferences which are private settings
FROM public.profiles;

-- Grant SELECT on the safe view to authenticated users
GRANT SELECT ON public.profiles_public TO authenticated;

-- Add a comment explaining the security model
COMMENT ON VIEW public.profiles_public IS 'Safe public view of profiles excluding sensitive PII (phone, emails). Use this view for displaying teammate information. This view bypasses RLS to allow all authenticated users to see public teammate info.';