ALTER POLICY "Company admins can view docusign tokens" ON public.docusign_tokens USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Company admins can view QB tokens" ON public.quickbooks_tokens;
CREATE POLICY "Users can view their own QB tokens"
  ON public.quickbooks_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

ALTER VIEW public.lender_outcome_stats SET (security_invoker = true);