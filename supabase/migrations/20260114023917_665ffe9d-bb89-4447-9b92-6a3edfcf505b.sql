-- Drop the overly permissive SELECT policy that exposes all profiles to any authenticated user
DROP POLICY IF EXISTS "Require authentication for profiles" ON public.profiles;

-- The remaining policies properly restrict access:
-- 1. "Users can view their own profile" - auth.uid() = user_id
-- 2. "Company members can view teammate profiles" - checks company membership
-- These already implicitly require authentication via auth.uid() checks