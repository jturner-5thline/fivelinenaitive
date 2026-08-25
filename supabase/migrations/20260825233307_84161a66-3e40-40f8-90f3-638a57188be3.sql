DROP POLICY IF EXISTS "Members can be added by admins or via invitation" ON public.company_members;

CREATE POLICY "Members can be added by admins or via invitation"
ON public.company_members
FOR INSERT
TO authenticated
WITH CHECK (
  is_company_admin(auth.uid(), company_id)
  OR (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM company_invitations ci
      WHERE ci.company_id = company_members.company_id
        AND ci.accepted_at IS NULL
        AND ci.expires_at > now()
        AND (
          lower(ci.email) = lower(COALESCE((auth.jwt() ->> 'email'), ''))
          OR ci.email LIKE 'link-invite-%@placeholder.local'
        )
        AND company_members.role = COALESCE(ci.role, 'member'::company_role)
    )
  )
  OR (
    user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM company_members cm WHERE cm.company_id = company_members.company_id
    )
  )
);