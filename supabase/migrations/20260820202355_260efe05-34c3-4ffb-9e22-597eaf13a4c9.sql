CREATE TABLE public.lender_doc_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  lender_name text NOT NULL,
  has_nda boolean NOT NULL DEFAULT false,
  has_marketing boolean NOT NULL DEFAULT false,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, lender_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lender_doc_flags TO authenticated;
GRANT ALL ON public.lender_doc_flags TO service_role;

ALTER TABLE public.lender_doc_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view lender doc flags" ON public.lender_doc_flags
FOR SELECT TO authenticated
USING (company_id IS NOT NULL AND is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can insert lender doc flags" ON public.lender_doc_flags
FOR INSERT TO authenticated
WITH CHECK (company_id IS NOT NULL AND is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can update lender doc flags" ON public.lender_doc_flags
FOR UPDATE TO authenticated
USING (company_id IS NOT NULL AND is_company_member(auth.uid(), company_id))
WITH CHECK (company_id IS NOT NULL AND is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can delete lender doc flags" ON public.lender_doc_flags
FOR DELETE TO authenticated
USING (company_id IS NOT NULL AND is_company_member(auth.uid(), company_id));

CREATE TRIGGER lender_doc_flags_updated_at BEFORE UPDATE ON public.lender_doc_flags
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();