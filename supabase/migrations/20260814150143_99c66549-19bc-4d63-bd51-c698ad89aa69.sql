CREATE POLICY "Org members insert metric targets"
ON public.insights_metric_targets FOR INSERT TO authenticated
WITH CHECK (
  company_id IS NOT NULL
  AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
);

CREATE POLICY "Org members update metric targets"
ON public.insights_metric_targets FOR UPDATE TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
)
WITH CHECK (
  company_id IS NOT NULL
  AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
);

CREATE POLICY "Org members delete metric targets"
ON public.insights_metric_targets FOR DELETE TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights_metric_targets TO authenticated;
GRANT ALL ON public.insights_metric_targets TO service_role;