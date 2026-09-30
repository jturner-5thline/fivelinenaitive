CREATE INDEX IF NOT EXISTS idx_master_lenders_company_name
  ON public.master_lenders (company_id, name);
CREATE INDEX IF NOT EXISTS idx_master_lenders_company_created_at
  ON public.master_lenders (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_master_lenders_company_updated_at
  ON public.master_lenders (company_id, updated_at DESC);