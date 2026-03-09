-- Fix 1: deal_call_transcripts SELECT policy - scope to deal access
DROP POLICY IF EXISTS "Users can view call transcripts for deals they have access to" ON public.deal_call_transcripts;
CREATE POLICY "Users can view call transcripts for deals they have access to"
  ON public.deal_call_transcripts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_call_transcripts.deal_id
        AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
    )
  );

-- Also fix INSERT policy to scope to deal access
DROP POLICY IF EXISTS "Authenticated users can insert call transcripts" ON public.deal_call_transcripts;
CREATE POLICY "Users can insert call transcripts for accessible deals"
  ON public.deal_call_transcripts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_call_transcripts.deal_id
        AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
    )
  );

-- Fix 2: lender_pass_patterns - scope all policies to company via master_lenders
DROP POLICY IF EXISTS "Authenticated users can view pass patterns" ON public.lender_pass_patterns;
CREATE POLICY "Company members can view pass patterns"
  ON public.lender_pass_patterns
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_lenders ml
      JOIN public.company_members cm ON cm.company_id = ml.company_id
      WHERE ml.id = lender_pass_patterns.master_lender_id
        AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can insert pass patterns" ON public.lender_pass_patterns;
CREATE POLICY "Company members can insert pass patterns"
  ON public.lender_pass_patterns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.master_lenders ml
      JOIN public.company_members cm ON cm.company_id = ml.company_id
      WHERE ml.id = lender_pass_patterns.master_lender_id
        AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users can update pass patterns" ON public.lender_pass_patterns;
CREATE POLICY "Company members can update pass patterns"
  ON public.lender_pass_patterns
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.master_lenders ml
      JOIN public.company_members cm ON cm.company_id = ml.company_id
      WHERE ml.id = lender_pass_patterns.master_lender_id
        AND cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.master_lenders ml
      JOIN public.company_members cm ON cm.company_id = ml.company_id
      WHERE ml.id = lender_pass_patterns.master_lender_id
        AND cm.user_id = auth.uid()
    )
  );