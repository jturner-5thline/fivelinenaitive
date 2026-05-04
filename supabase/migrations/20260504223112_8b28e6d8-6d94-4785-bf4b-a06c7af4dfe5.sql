
CREATE TABLE public.naitive_pipeline_narratives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.naitive_pipeline_narratives ENABLE ROW LEVEL SECURITY;

-- Any authenticated member of the company can read & write the shared narrative.
CREATE POLICY "Members can read narrative"
  ON public.naitive_pipeline_narratives FOR SELECT
  TO authenticated
  USING (company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE POLICY "Members can insert narrative"
  ON public.naitive_pipeline_narratives FOR INSERT
  TO authenticated
  WITH CHECK (company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE POLICY "Members can update narrative"
  ON public.naitive_pipeline_narratives FOR UPDATE
  TO authenticated
  USING (company_id = ANY (public.get_user_company_ids(auth.uid())))
  WITH CHECK (company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE TRIGGER update_naitive_pipeline_narratives_updated_at
  BEFORE UPDATE ON public.naitive_pipeline_narratives
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
