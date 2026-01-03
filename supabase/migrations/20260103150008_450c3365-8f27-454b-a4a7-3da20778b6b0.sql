-- Drop the overly permissive policy that exposes all invitations
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON public.company_invitations;

-- Create a more restricted policy that only allows:
-- 1. Authenticated users to view invitations sent to their email address
-- 2. Company admins to view their company's invitations (already exists)
CREATE POLICY "Users can view invitations sent to their email"
ON public.company_invitations
FOR SELECT
USING (
  -- Allow authenticated users to see invitations sent to their own email
  auth.uid() IS NOT NULL 
  AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Add policy for accepting invitations (UPDATE) for users with matching email
CREATE POLICY "Users can accept their own invitations"
ON public.company_invitations
FOR UPDATE
USING (
  auth.uid() IS NOT NULL 
  AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
  AND accepted_at IS NULL
)
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
);