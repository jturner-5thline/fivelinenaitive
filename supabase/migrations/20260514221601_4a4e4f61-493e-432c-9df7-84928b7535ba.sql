
-- agreement_templates: scope SELECT to company members
DROP POLICY IF EXISTS "Anyone can view active agreement templates" ON public.agreement_templates;
CREATE POLICY "Company members can view agreement templates"
ON public.agreement_templates
FOR SELECT
TO authenticated
USING (
  company_id IS NULL
  OR is_company_member(auth.uid(), company_id)
  OR is_admin(auth.uid())
);

-- agreement_sections: scope SELECT via parent template
DROP POLICY IF EXISTS "Anyone can view agreement sections" ON public.agreement_sections;
CREATE POLICY "Company members can view agreement sections"
ON public.agreement_sections
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agreement_templates t
    WHERE t.id = agreement_sections.template_id
      AND (
        t.company_id IS NULL
        OR is_company_member(auth.uid(), t.company_id)
        OR is_admin(auth.uid())
      )
  )
);

-- page_access_allowlist: admins only
DROP POLICY IF EXISTS "Authenticated users can view page allowlist" ON public.page_access_allowlist;
CREATE POLICY "Admins can view page allowlist"
ON public.page_access_allowlist
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- qb_cashflow_mapping_rules: admins only (no company_id column)
DROP POLICY IF EXISTS "Authenticated can read qb mapping rules" ON public.qb_cashflow_mapping_rules;
CREATE POLICY "Admins can read qb mapping rules"
ON public.qb_cashflow_mapping_rules
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- asana_sync_log: restrict INSERT to user's company
DROP POLICY IF EXISTS "Authenticated can insert asana sync log" ON public.asana_sync_log;
CREATE POLICY "Company members can insert asana sync log"
ON public.asana_sync_log
FOR INSERT
TO authenticated
WITH CHECK (
  company_id IS NULL
  OR is_company_member(auth.uid(), company_id)
);
