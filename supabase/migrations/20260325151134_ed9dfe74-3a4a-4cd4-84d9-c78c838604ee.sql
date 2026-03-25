
CREATE TABLE public.sheet_cell_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  sheet_id text NOT NULL,
  row_key text NOT NULL,
  col_key text NOT NULL,
  cell_type text NOT NULL CHECK (cell_type IN ('formula', 'qbo_metric', 'static')),
  formula_string text,
  qbo_metric_id text,
  qbo_entity text,
  qbo_account text,
  qbo_aggregation text,
  qbo_time_window jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, sheet_id, row_key, col_key)
);

ALTER TABLE public.sheet_cell_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view cell configs"
  ON public.sheet_cell_config FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company admins can manage cell configs"
  ON public.sheet_cell_config FOR ALL TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE TRIGGER update_sheet_cell_config_updated_at
  BEFORE UPDATE ON public.sheet_cell_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
