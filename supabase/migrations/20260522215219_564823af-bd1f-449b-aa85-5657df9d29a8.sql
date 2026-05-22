ALTER TABLE public.qbo_pnl_snapshots
ADD COLUMN IF NOT EXISTS operating_expenses NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.qbo_cashflow_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  user_id UUID NOT NULL,
  realm_id TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  accounting_method TEXT NOT NULL DEFAULT 'Accrual',
  bucket_start DATE NOT NULL,
  bucket_end DATE NOT NULL,
  bucket_label TEXT NOT NULL,
  net_cash_flow NUMERIC NOT NULL DEFAULT 0,
  raw_response JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, realm_id, period_start, period_end, accounting_method, bucket_start, bucket_end)
);

ALTER TABLE public.qbo_cashflow_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_qbo_cashflow_snapshots_company_realm_period
  ON public.qbo_cashflow_snapshots (company_id, realm_id, accounting_method, period_start, period_end, bucket_start);

CREATE INDEX IF NOT EXISTS idx_qbo_cashflow_snapshots_realm_period
  ON public.qbo_cashflow_snapshots (realm_id, period_start, period_end, bucket_start);

DROP POLICY IF EXISTS "Insights users can view QBO cashflow snapshots" ON public.qbo_cashflow_snapshots;
CREATE POLICY "Insights users can view QBO cashflow snapshots"
ON public.qbo_cashflow_snapshots
FOR SELECT
TO authenticated
USING (public.can_view_company_insights(company_id));

DROP TRIGGER IF EXISTS update_qbo_cashflow_snapshots_updated_at ON public.qbo_cashflow_snapshots;
CREATE TRIGGER update_qbo_cashflow_snapshots_updated_at
BEFORE UPDATE ON public.qbo_cashflow_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();