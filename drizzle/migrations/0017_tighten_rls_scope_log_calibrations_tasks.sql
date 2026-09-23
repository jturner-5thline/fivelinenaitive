DROP POLICY IF EXISTS "Authenticated members read claap sync scope log" ON public.claap_sync_scope_log;
CREATE POLICY "Admins read claap sync scope log" ON public.claap_sync_scope_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated users can view calibrations" ON public.lender_match_weight_calibrations;
DROP POLICY IF EXISTS "Authenticated users can insert calibrations" ON public.lender_match_weight_calibrations;
DROP POLICY IF EXISTS "Authenticated users can update calibrations" ON public.lender_match_weight_calibrations;
CREATE POLICY "Company members view calibrations" ON public.lender_match_weight_calibrations FOR SELECT TO authenticated USING (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "Company members insert calibrations" ON public.lender_match_weight_calibrations FOR INSERT TO authenticated WITH CHECK (public.is_company_member(auth.uid(), company_id));
CREATE POLICY "Company members update calibrations" ON public.lender_match_weight_calibrations FOR UPDATE TO authenticated USING (public.is_company_member(auth.uid(), company_id)) WITH CHECK (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS "Users can update tasks in their company" ON public.tasks;
CREATE POLICY "Users can update tasks in their company" ON public.tasks FOR UPDATE
USING ((auth.uid() = assigned_to) OR (auth.uid() = assigned_by) OR public.is_same_company_as_user(auth.uid(), assigned_by))
WITH CHECK ((auth.uid() = assigned_to) OR (auth.uid() = assigned_by) OR public.is_same_company_as_user(auth.uid(), assigned_by));