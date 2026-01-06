-- Fix company invitation RLS policies to avoid querying auth.users (causes "permission denied for table users")

-- Drop policies that reference auth.users
DROP POLICY IF EXISTS "Users can view invitations sent to their email" ON public.company_invitations;
DROP POLICY IF EXISTS "Users can accept their own invitations" ON public.company_invitations;

-- Recreate policies using the authenticated user's JWT email claim
-- Note: auth.jwt() is available for authenticated requests; we also guard with auth.uid() is not null.
CREATE POLICY "Users can view invitations sent to their email"
ON public.company_invitations
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
);

CREATE POLICY "Users can accept their own invitations"
ON public.company_invitations
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND accepted_at IS NULL
  AND lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
);
