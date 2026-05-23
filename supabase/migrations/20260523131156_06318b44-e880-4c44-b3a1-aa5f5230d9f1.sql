
-- Fix RLS gaps: tighten access checks on deal-scoped AI/lender tables.

-- deal_ai_status_snapshots: require deal access
DROP POLICY IF EXISTS "View snapshots for accessible deals" ON public.deal_ai_status_snapshots;
DROP POLICY IF EXISTS "Insert snapshots for accessible deals" ON public.deal_ai_status_snapshots;
CREATE POLICY "View snapshots for accessible deals"
  ON public.deal_ai_status_snapshots FOR SELECT
  USING (public.can_access_deal(auth.uid(), deal_id));
CREATE POLICY "Insert snapshots for accessible deals"
  ON public.deal_ai_status_snapshots FOR INSERT
  WITH CHECK (public.can_access_deal(auth.uid(), deal_id));

-- deal_fit_profiles: require deal access on SELECT
DROP POLICY IF EXISTS "View deal fit profile via deal access" ON public.deal_fit_profiles;
CREATE POLICY "View deal fit profile via deal access"
  ON public.deal_fit_profiles FOR SELECT
  USING (public.can_access_deal(auth.uid(), deal_id));

-- lender_match_rules: restrict reads to internal 5th Line / naitive users
DROP POLICY IF EXISTS "All authed users can read match rules" ON public.lender_match_rules;
CREATE POLICY "Internal users read match rules"
  ON public.lender_match_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND ((u.email)::text LIKE '%@5thline.co' OR (u.email)::text LIKE '%@naitive.co')
    )
  );

-- lender_recommendation_runs/items/outcomes: require deal access on SELECT
DROP POLICY IF EXISTS "View runs via deal access" ON public.lender_recommendation_runs;
CREATE POLICY "View runs via deal access"
  ON public.lender_recommendation_runs FOR SELECT
  USING (public.can_access_deal(auth.uid(), deal_id));

DROP POLICY IF EXISTS "View run items via run access" ON public.lender_recommendation_run_items;
CREATE POLICY "View run items via run access"
  ON public.lender_recommendation_run_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.lender_recommendation_runs r
      WHERE r.id = lender_recommendation_run_items.run_id
        AND public.can_access_deal(auth.uid(), r.deal_id)
    )
  );

DROP POLICY IF EXISTS "View outcomes via deal access" ON public.lender_recommendation_outcomes;
CREATE POLICY "View outcomes via deal access"
  ON public.lender_recommendation_outcomes FOR SELECT
  USING (public.can_access_deal(auth.uid(), deal_id));

-- naitive_deal_stage_meta: tenant-scope via deal access
DROP POLICY IF EXISTS naitive_deal_stage_meta_select ON public.naitive_deal_stage_meta;
DROP POLICY IF EXISTS naitive_deal_stage_meta_insert ON public.naitive_deal_stage_meta;
DROP POLICY IF EXISTS naitive_deal_stage_meta_update ON public.naitive_deal_stage_meta;

CREATE POLICY naitive_deal_stage_meta_select
  ON public.naitive_deal_stage_meta FOR SELECT
  USING (public.can_access_deal(auth.uid(), deal_id));
CREATE POLICY naitive_deal_stage_meta_insert
  ON public.naitive_deal_stage_meta FOR INSERT
  WITH CHECK (public.can_access_deal(auth.uid(), deal_id));
CREATE POLICY naitive_deal_stage_meta_update
  ON public.naitive_deal_stage_meta FOR UPDATE
  USING (public.can_access_deal(auth.uid(), deal_id))
  WITH CHECK (public.can_access_deal(auth.uid(), deal_id));
