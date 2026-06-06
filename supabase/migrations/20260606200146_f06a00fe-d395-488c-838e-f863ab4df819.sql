
CREATE TABLE public.insights_report_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  report_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by_name TEXT,
  submitted_at TIMESTAMPTZ,
  unsubmitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  unsubmitted_by_name TEXT,
  unsubmitted_at TIMESTAMPTZ,
  submit_count INTEGER NOT NULL DEFAULT 0,
  audit JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, report_key, period_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights_report_submissions TO authenticated;
GRANT ALL ON public.insights_report_submissions TO service_role;

ALTER TABLE public.insights_report_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view submissions"
  ON public.insights_report_submissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = insights_report_submissions.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can insert submissions"
  ON public.insights_report_submissions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = insights_report_submissions.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can update submissions"
  ON public.insights_report_submissions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = insights_report_submissions.company_id
        AND cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = insights_report_submissions.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_insights_report_submissions_updated_at
  BEFORE UPDATE ON public.insights_report_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_insights_report_submissions_lookup
  ON public.insights_report_submissions (company_id, report_key, period_key);
