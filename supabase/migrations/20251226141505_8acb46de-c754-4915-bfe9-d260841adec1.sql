-- Drop the faulty policy
DROP POLICY IF EXISTS "Admins can add members" ON public.company_members;

-- Create corrected policy for adding members
-- Allows: admins to add members, OR allows first member (owner) when company has no members yet
CREATE POLICY "Admins can add members" 
ON public.company_members 
FOR INSERT 
WITH CHECK (
  is_company_admin(auth.uid(), company_id) 
  OR (
    user_id = auth.uid() 
    AND NOT EXISTS (
      SELECT 1 FROM public.company_members cm 
      WHERE cm.company_id = company_members.company_id
    )
  )
);