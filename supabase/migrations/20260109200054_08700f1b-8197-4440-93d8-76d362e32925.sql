-- Fix company_members INSERT policy to allow invited users to join
DROP POLICY IF EXISTS "Admins can add members" ON public.company_members;

CREATE POLICY "Members can be added by admins or via invitation" 
ON public.company_members 
FOR INSERT 
WITH CHECK (
  -- Admins can add anyone
  is_company_admin(auth.uid(), company_id) 
  OR 
  -- Users can add themselves if they have a valid pending invitation for this company
  (
    user_id = auth.uid() 
    AND EXISTS (
      SELECT 1 FROM public.company_invitations ci
      WHERE ci.company_id = company_members.company_id
      AND ci.accepted_at IS NULL
      AND ci.expires_at > now()
      AND (
        -- Either email matches
        lower(ci.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
        -- Or it's a link-only invite (placeholder email)
        OR ci.email LIKE 'link-invite-%@placeholder.local'
      )
    )
  )
  OR
  -- First member (owner) creating a new company
  (user_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id))
);

-- Fix company_invitations UPDATE policy to allow accepting link-only invites
DROP POLICY IF EXISTS "Users can accept their own invitations" ON public.company_invitations;

CREATE POLICY "Users can accept invitations" 
ON public.company_invitations 
FOR UPDATE 
USING (
  auth.uid() IS NOT NULL
  AND accepted_at IS NULL
  AND (
    -- Email matches
    lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    -- Or it's a link-only invite
    OR email LIKE 'link-invite-%@placeholder.local'
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    OR email LIKE 'link-invite-%@placeholder.local'
  )
);