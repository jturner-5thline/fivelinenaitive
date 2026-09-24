DROP POLICY IF EXISTS "Company members view calibrations" ON public.lender_match_weight_calibrations;
CREATE POLICY "Company members view calibrations" ON public.lender_match_weight_calibrations
FOR SELECT TO authenticated
USING (company_id IS NULL OR public.is_company_member(auth.uid(), company_id) OR public.has_role(auth.uid(), 'admin'));