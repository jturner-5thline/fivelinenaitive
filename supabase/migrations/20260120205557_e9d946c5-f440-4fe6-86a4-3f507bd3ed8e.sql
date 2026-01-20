-- Create a safe public view for teammate profiles that excludes sensitive PII
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on) AS
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

-- Drop the overly permissive policy that exposes all profile fields to company members
DROP POLICY IF EXISTS "Company members can view teammate profiles" ON public.profiles;

-- Create a new restricted policy - company members can only see profiles via the public view
-- Direct table access is limited to own profile only
CREATE POLICY "Users can only view their own profile directly"
ON public.profiles
FOR SELECT
USING (auth.uid() = user_id);

-- Grant SELECT on the safe view to authenticated users
GRANT SELECT ON public.profiles_public TO authenticated;

-- Add a comment explaining the security model
COMMENT ON VIEW public.profiles_public IS 'Safe public view of profiles excluding sensitive PII (phone, emails). Use this view for displaying teammate information. Direct profiles table access is restricted to own profile only.';