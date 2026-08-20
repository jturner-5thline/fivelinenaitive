CREATE TABLE public.crm_industry_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_industry_options TO authenticated;
GRANT ALL ON public.crm_industry_options TO service_role;

ALTER TABLE public.crm_industry_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY crm_industry_options_select ON public.crm_industry_options FOR SELECT TO authenticated
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY crm_industry_options_insert ON public.crm_industry_options FOR INSERT TO authenticated
WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY crm_industry_options_update ON public.crm_industry_options FOR UPDATE TO authenticated
USING (company_id = get_user_company_id(auth.uid()))
WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY crm_industry_options_delete ON public.crm_industry_options FOR DELETE TO authenticated
USING (company_id = get_user_company_id(auth.uid()));

CREATE TRIGGER crm_industry_options_updated_at
BEFORE UPDATE ON public.crm_industry_options
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();