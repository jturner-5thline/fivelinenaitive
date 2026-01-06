-- Fix DELETE policy for deals to handle company members properly
-- The issue is deals with NULL user_id can't be deleted

-- Drop and recreate the delete policy to also allow company admins to delete deals
DROP POLICY IF EXISTS "Users can delete deals" ON public.deals;

CREATE POLICY "Users can delete deals" 
ON public.deals 
FOR DELETE 
USING (
  (auth.uid() = user_id) 
  OR (
    company_id IS NOT NULL 
    AND is_company_admin(auth.uid(), company_id)
  )
);

-- Note: Changed from is_company_member to is_company_admin for delete operations
-- This ensures only admins/owners can delete company deals, not all members