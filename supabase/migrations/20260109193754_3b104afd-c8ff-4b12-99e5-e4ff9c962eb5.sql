-- Drop existing insert policy for invitations
DROP POLICY IF EXISTS "Admins can create invitations" ON public.company_invitations;

-- Create new policy allowing any company member to create invitations
CREATE POLICY "Members can create invitations"
ON public.company_invitations
FOR INSERT
WITH CHECK (
  is_company_member(auth.uid(), company_id)
);