
CREATE TABLE public.shared_pipeline_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by UUID NOT NULL,
  sender_name TEXT,
  sender_email TEXT,
  subject TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT NOT NULL,
  recipients TEXT[] NOT NULL DEFAULT '{}',
  cc TEXT[] NOT NULL DEFAULT '{}',
  pipeline_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shared_pipeline_reports_created_at ON public.shared_pipeline_reports (created_at DESC);

GRANT SELECT, INSERT ON public.shared_pipeline_reports TO authenticated;
GRANT ALL ON public.shared_pipeline_reports TO service_role;

ALTER TABLE public.shared_pipeline_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "5th Line members can view shared pipeline reports"
ON public.shared_pipeline_reports
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  )
);

CREATE POLICY "5th Line members can insert shared pipeline reports"
ON public.shared_pipeline_reports
FOR INSERT
TO authenticated
WITH CHECK (
  sent_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  )
);
