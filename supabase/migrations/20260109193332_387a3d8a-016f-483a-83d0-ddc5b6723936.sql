-- Drop existing policies on deals table
DROP POLICY IF EXISTS "Users can view deals" ON public.deals;
DROP POLICY IF EXISTS "Users can update deals" ON public.deals;
DROP POLICY IF EXISTS "Users can delete deals" ON public.deals;

-- Create helper function to check if a user is in the same company as the deal owner
CREATE OR REPLACE FUNCTION public.is_same_company_as_user(_current_user_id uuid, _deal_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm1
    JOIN public.company_members cm2 ON cm1.company_id = cm2.company_id
    WHERE cm1.user_id = _current_user_id
      AND cm2.user_id = _deal_owner_id
  )
$$;

-- Create new SELECT policy: Show company deals OR deals from any team member
CREATE POLICY "Users can view deals"
ON public.deals
FOR SELECT
USING (
  CASE 
    WHEN get_user_company_id(auth.uid()) IS NOT NULL THEN
      -- User is in a company: show deals with matching company_id OR deals owned by any teammate
      company_id = get_user_company_id(auth.uid()) 
      OR is_same_company_as_user(auth.uid(), user_id)
    ELSE
      -- User is not in a company, show their own personal deals
      auth.uid() = user_id
  END
);

-- Create new UPDATE policy: Same logic
CREATE POLICY "Users can update deals"
ON public.deals
FOR UPDATE
USING (
  CASE 
    WHEN get_user_company_id(auth.uid()) IS NOT NULL THEN
      company_id = get_user_company_id(auth.uid())
      OR is_same_company_as_user(auth.uid(), user_id)
    ELSE
      auth.uid() = user_id
  END
);

-- Create new DELETE policy: Only company admins can delete, or own personal deals
CREATE POLICY "Users can delete deals"
ON public.deals
FOR DELETE
USING (
  CASE 
    WHEN get_user_company_id(auth.uid()) IS NOT NULL THEN
      -- Must be admin and deal must be in company or owned by teammate
      is_company_admin(auth.uid(), get_user_company_id(auth.uid()))
      AND (
        company_id = get_user_company_id(auth.uid())
        OR is_same_company_as_user(auth.uid(), user_id)
      )
    ELSE
      auth.uid() = user_id
  END
);