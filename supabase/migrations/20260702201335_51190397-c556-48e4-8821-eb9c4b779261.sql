ALTER TABLE public.qbo_cashflow_snapshots
  ADD COLUMN IF NOT EXISTS intercompany_adjustment NUMERIC NOT NULL DEFAULT 0;