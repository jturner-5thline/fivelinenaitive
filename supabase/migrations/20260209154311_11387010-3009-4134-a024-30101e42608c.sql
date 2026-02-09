-- Recreate profiles_public view as security definer (security_invoker=false) 
-- so teammates can see each other's display names and avatars
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public
WITH (security_invoker=false) AS
  SELECT id,
    user_id,
    display_name,
    first_name,
    last_name,
    avatar_url,
    company_name,
    company_role,
    created_at
  FROM public.profiles;