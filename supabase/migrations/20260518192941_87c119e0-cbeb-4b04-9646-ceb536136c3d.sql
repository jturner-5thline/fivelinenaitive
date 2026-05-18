
CREATE TABLE public.naitive_pipeline_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL DEFAULT '44556c46-9127-4b12-b14e-d6fee784afcf',
  submitted_by UUID NOT NULL,
  submitter_name TEXT,
  submitter_email TEXT,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  period_type TEXT,
  period_key TEXT,
  period_label TEXT,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_naitive_pipeline_reports_created_at ON public.naitive_pipeline_reports (created_at DESC);

ALTER TABLE public.naitive_pipeline_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "5th Line members can view naitive pipeline reports"
ON public.naitive_pipeline_reports
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  )
);

CREATE POLICY "5th Line members can submit naitive pipeline reports"
ON public.naitive_pipeline_reports
FOR INSERT
TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  )
);
