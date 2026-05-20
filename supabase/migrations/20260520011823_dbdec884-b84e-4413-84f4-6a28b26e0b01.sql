
-- Performance: add missing indexes for Deals page load
CREATE INDEX IF NOT EXISTS idx_deals_user_id ON public.deals(user_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON public.deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_status ON public.deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_updated_at ON public.deals(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_deal_class ON public.deals(deal_class);
CREATE INDEX IF NOT EXISTS idx_deals_pipeline_id ON public.deals(pipeline_id);

-- deal_lenders: lookups always join by deal_id
CREATE INDEX IF NOT EXISTS idx_deal_lenders_deal_id ON public.deal_lenders(deal_id);

-- company_members: RLS helpers look up by user_id constantly
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON public.company_members(user_id);

-- lender_notes_history: filtered by deal_lender_id
CREATE INDEX IF NOT EXISTS idx_lender_notes_history_deal_lender_id ON public.lender_notes_history(deal_lender_id);

-- Optimize RLS by wrapping helper-fn calls in (select ...) so Postgres
-- evaluates them once per query (initPlan caching) instead of per row.
-- This is the official Supabase RLS performance pattern.
DROP POLICY IF EXISTS "Users can view deals" ON public.deals;
CREATE POLICY "Users can view deals" ON public.deals
FOR SELECT
USING (
  CASE
    WHEN (SELECT public.get_user_company_id(auth.uid())) IS NOT NULL
      THEN company_id = (SELECT public.get_user_company_id(auth.uid()))
        OR (SELECT public.is_same_company_as_user(auth.uid(), user_id))
    ELSE auth.uid() = user_id
  END
);

DROP POLICY IF EXISTS "Users can update deals" ON public.deals;
CREATE POLICY "Users can update deals" ON public.deals
FOR UPDATE
USING (
  CASE
    WHEN (SELECT public.get_user_company_id(auth.uid())) IS NOT NULL
      THEN company_id = (SELECT public.get_user_company_id(auth.uid()))
        OR (SELECT public.is_same_company_as_user(auth.uid(), user_id))
    ELSE auth.uid() = user_id
  END
);

-- Refresh planner stats so new indexes are used immediately
ANALYZE public.deals;
ANALYZE public.deal_lenders;
ANALYZE public.company_members;
ANALYZE public.lender_notes_history;
