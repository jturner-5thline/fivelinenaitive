-- Function to get team members for @mention (includes email, first/last name)
-- Security definer so it bypasses RLS but scoped to same company
CREATE OR REPLACE FUNCTION public.get_team_members_for_mention(_user_id uuid)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  first_name text,
  last_name text,
  email text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.user_id,
    p.display_name,
    p.first_name,
    p.last_name,
    p.email,
    p.avatar_url
  FROM public.profiles p
  JOIN public.company_members cm1 ON cm1.user_id = p.user_id
  JOIN public.company_members cm2 ON cm2.company_id = cm1.company_id
  WHERE cm2.user_id = _user_id
$$;