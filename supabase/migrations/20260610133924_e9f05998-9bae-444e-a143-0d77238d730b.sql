
-- 1. data_quality_issues: restrict reads to deals the user can access
DROP POLICY IF EXISTS "Authenticated read data quality issues" ON public.data_quality_issues;
CREATE POLICY "Members read data quality issues for accessible deals"
ON public.data_quality_issues
FOR SELECT
TO authenticated
USING (
  deal_id IS NULL
  OR public.can_access_deal(auth.uid(), deal_id)
);

-- 2. finserv_deal_projects: require can_access_deal
DROP POLICY IF EXISTS "View finserv projects for accessible deals" ON public.finserv_deal_projects;
DROP POLICY IF EXISTS "Insert finserv projects for accessible deals" ON public.finserv_deal_projects;
DROP POLICY IF EXISTS "Update finserv projects for accessible deals" ON public.finserv_deal_projects;
DROP POLICY IF EXISTS "Delete finserv projects for accessible deals" ON public.finserv_deal_projects;

CREATE POLICY "View finserv projects for accessible deals"
ON public.finserv_deal_projects FOR SELECT TO authenticated
USING (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Insert finserv projects for accessible deals"
ON public.finserv_deal_projects FOR INSERT TO authenticated
WITH CHECK (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Update finserv projects for accessible deals"
ON public.finserv_deal_projects FOR UPDATE TO authenticated
USING (public.can_access_deal(auth.uid(), deal_id))
WITH CHECK (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Delete finserv projects for accessible deals"
ON public.finserv_deal_projects FOR DELETE TO authenticated
USING (public.can_access_deal(auth.uid(), deal_id));

-- 3. finserv_mrr_components: require can_access_deal
DROP POLICY IF EXISTS "View mrr components for accessible deals" ON public.finserv_mrr_components;
DROP POLICY IF EXISTS "Insert mrr components for accessible deals" ON public.finserv_mrr_components;
DROP POLICY IF EXISTS "Update mrr components for accessible deals" ON public.finserv_mrr_components;
DROP POLICY IF EXISTS "Delete mrr components for accessible deals" ON public.finserv_mrr_components;

CREATE POLICY "View mrr components for accessible deals"
ON public.finserv_mrr_components FOR SELECT TO authenticated
USING (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Insert mrr components for accessible deals"
ON public.finserv_mrr_components FOR INSERT TO authenticated
WITH CHECK (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Update mrr components for accessible deals"
ON public.finserv_mrr_components FOR UPDATE TO authenticated
USING (public.can_access_deal(auth.uid(), deal_id))
WITH CHECK (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Delete mrr components for accessible deals"
ON public.finserv_mrr_components FOR DELETE TO authenticated
USING (public.can_access_deal(auth.uid(), deal_id));

-- 4. mat_view_refresh_log: restrict to admins
DROP POLICY IF EXISTS "Authenticated read refresh log" ON public.mat_view_refresh_log;
CREATE POLICY "Admins read refresh log"
ON public.mat_view_refresh_log FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

-- 5. recognition_log: restrict INSERT to service_role
DROP POLICY IF EXISTS "service_insert_recognition_log" ON public.recognition_log;
CREATE POLICY "service_insert_recognition_log"
ON public.recognition_log FOR INSERT TO service_role
WITH CHECK (true);

-- 6. Materialized views accessible over the Data API — revoke API role access
REVOKE ALL ON public.deal_stage_transitions FROM anon, authenticated;
REVOKE ALL ON public.deal_stage_durations FROM anon, authenticated;
