CREATE TABLE IF NOT EXISTS public.qbo_pnl_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  user_id UUID NOT NULL,
  realm_id TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  accounting_method TEXT NOT NULL DEFAULT 'Accrual',
  income_total NUMERIC NOT NULL DEFAULT 0,
  cogs_total NUMERIC NOT NULL DEFAULT 0,
  gross_profit NUMERIC NOT NULL DEFAULT 0,
  raw_response JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, realm_id, period_start, period_end, accounting_method)
);

ALTER TABLE public.qbo_pnl_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_qbo_pnl_snapshots_company_realm_period
  ON public.qbo_pnl_snapshots (company_id, realm_id, accounting_method, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_qbo_pnl_snapshots_realm_period
  ON public.qbo_pnl_snapshots (realm_id, period_start, period_end);

CREATE OR REPLACE FUNCTION public.can_view_company_insights(_company_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.page_access_allowlist pal
      ON pal.page_key = 'insights'
     AND lower(pal.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    WHERE cm.company_id = _company_id
      AND cm.user_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Insights users can view QBO P&L snapshots" ON public.qbo_pnl_snapshots;
CREATE POLICY "Insights users can view QBO P&L snapshots"
ON public.qbo_pnl_snapshots
FOR SELECT
TO authenticated
USING (public.can_view_company_insights(company_id));

DROP TRIGGER IF EXISTS update_qbo_pnl_snapshots_updated_at ON public.qbo_pnl_snapshots;
CREATE TRIGGER update_qbo_pnl_snapshots_updated_at
BEFORE UPDATE ON public.qbo_pnl_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();