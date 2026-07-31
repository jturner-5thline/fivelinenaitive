REVOKE SELECT ON public.quickbooks_tokens FROM authenticated;
GRANT SELECT (id, user_id, company_id, realm_id, expires_at, token_type, scope, created_at, updated_at, company_name) ON public.quickbooks_tokens TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.quickbooks_tokens TO authenticated;
GRANT ALL ON public.quickbooks_tokens TO service_role;

DROP POLICY IF EXISTS "Company members can view QB tokens" ON public.quickbooks_tokens;
CREATE POLICY "Company members can view QB connection metadata"
ON public.quickbooks_tokens
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT cm2.user_id FROM company_members cm1
    JOIN company_members cm2 ON cm1.company_id = cm2.company_id
    WHERE cm1.user_id = auth.uid()
  )
);