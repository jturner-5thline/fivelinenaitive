-- Drop existing policies on deals table
DROP POLICY IF EXISTS "Users can view deals" ON public.deals;
DROP POLICY IF EXISTS "Users can update deals" ON public.deals;
DROP POLICY IF EXISTS "Users can delete deals" ON public.deals;
DROP POLICY IF EXISTS "Users can create deals" ON public.deals;

-- Create new SELECT policy: If user is in a company, only show company deals
CREATE POLICY "Users can view deals"
ON public.deals
FOR SELECT
USING (
  CASE 
    WHEN get_user_company_id(auth.uid()) IS NOT NULL THEN
      -- User is in a company, only show that company's deals
      company_id = get_user_company_id(auth.uid())
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
    ELSE
      auth.uid() = user_id
  END
);

-- Create new DELETE policy: Only company admins can delete company deals
CREATE POLICY "Users can delete deals"
ON public.deals
FOR DELETE
USING (
  CASE 
    WHEN get_user_company_id(auth.uid()) IS NOT NULL THEN
      -- User is in a company, only admins can delete company deals
      company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid(), company_id)
    ELSE
      -- User is not in a company, can delete their own deals
      auth.uid() = user_id
  END
);

-- Create new INSERT policy: Deals created by company members get company_id automatically
CREATE POLICY "Users can create deals"
ON public.deals
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
);