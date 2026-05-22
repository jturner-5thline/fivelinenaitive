ALTER TABLE public.company_members
ADD COLUMN IF NOT EXISTS can_see_insights boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_company_members_company_user_can_see_insights
  ON public.company_members (company_id, user_id, can_see_insights);

CREATE OR REPLACE FUNCTION public.can_view_company_insights(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = _company_id
      AND cm.user_id = auth.uid()
      AND cm.can_see_insights = true
  );
$$;

DROP POLICY IF EXISTS "Insights users can view QBO P&L snapshots" ON public.qbo_pnl_snapshots;
CREATE POLICY "Insights users can view QBO P&L snapshots"
ON public.qbo_pnl_snapshots
FOR SELECT
TO authenticated
USING (public.can_view_company_insights(company_id));