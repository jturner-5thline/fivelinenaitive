
CREATE TABLE public.qir_report_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  report_key text NOT NULL,
  period_key text NOT NULL,
  content jsonb NOT NULL,
  source text NOT NULL DEFAULT 'save',
  saved_by uuid,
  saved_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX qir_report_versions_lookup_idx
  ON public.qir_report_versions (company_id, report_key, period_key, created_at DESC);

GRANT SELECT, INSERT ON public.qir_report_versions TO authenticated;
GRANT ALL ON public.qir_report_versions TO service_role;

ALTER TABLE public.qir_report_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view report versions"
  ON public.qir_report_versions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = qir_report_versions.company_id
      AND cm.user_id = auth.uid()
  ));

CREATE POLICY "Company members can insert report versions"
  ON public.qir_report_versions FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = qir_report_versions.company_id
      AND cm.user_id = auth.uid()
  ));
