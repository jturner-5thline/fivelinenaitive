DROP POLICY IF EXISTS "Company members can view QB connection metadata" ON public.quickbooks_tokens;
DROP POLICY IF EXISTS "Users can manage their own QB tokens write" ON public.quickbooks_tokens;

CREATE POLICY "Company admins can view QB tokens"
ON public.quickbooks_tokens
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.company_members admin_membership
    JOIN public.company_members token_owner_membership
      ON token_owner_membership.company_id = admin_membership.company_id
    WHERE admin_membership.user_id = auth.uid()
      AND admin_membership.role IN ('owner'::public.company_role, 'admin'::public.company_role)
      AND token_owner_membership.user_id = quickbooks_tokens.user_id
  )
);

CREATE POLICY "Users can create their own QB tokens"
ON public.quickbooks_tokens
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own QB tokens"
ON public.quickbooks_tokens
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own QB tokens"
ON public.quickbooks_tokens
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);