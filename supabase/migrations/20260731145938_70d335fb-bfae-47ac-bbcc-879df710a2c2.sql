ALTER TABLE public.master_lenders
  ADD COLUMN IF NOT EXISTS crm_company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_master_lenders_crm_company_id ON public.master_lenders(crm_company_id);