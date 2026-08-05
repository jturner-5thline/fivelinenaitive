CREATE TABLE public.lender_duplicate_dismissals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  dismissal_key text not null,
  lender_ids uuid[] not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (company_id, dismissal_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lender_duplicate_dismissals TO authenticated;
GRANT ALL ON public.lender_duplicate_dismissals TO service_role;

ALTER TABLE public.lender_duplicate_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company lender dismissals"
ON public.lender_duplicate_dismissals FOR SELECT TO authenticated
USING (is_company_member(auth.uid(), company_id));

CREATE POLICY "Users can create lender dismissals for own company"
ON public.lender_duplicate_dismissals FOR INSERT TO authenticated
WITH CHECK (is_company_member(auth.uid(), company_id) AND created_by = auth.uid());

CREATE POLICY "Users can delete own company lender dismissals"
ON public.lender_duplicate_dismissals FOR DELETE TO authenticated
USING (is_company_member(auth.uid(), company_id));

CREATE INDEX idx_lender_dup_dismissals_company ON public.lender_duplicate_dismissals(company_id);