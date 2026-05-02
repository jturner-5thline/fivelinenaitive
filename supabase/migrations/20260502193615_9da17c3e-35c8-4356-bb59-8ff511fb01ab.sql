-- Rename our new table out of the way
ALTER TABLE public.report_runs RENAME TO recurring_report_runs;
ALTER INDEX idx_report_runs_key_created RENAME TO idx_recurring_report_runs_key_created;
ALTER POLICY "Admins can view report runs" ON public.recurring_report_runs RENAME TO "Admins can view recurring report runs";

-- Restore original report_runs (linked to scheduled_reports)
CREATE TABLE public.report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_report_id UUID NOT NULL REFERENCES public.scheduled_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  report_data JSONB,
  summary_text TEXT,
  delivery_status TEXT DEFAULT 'pending',
  delivery_response JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_runs_scheduled ON public.report_runs(scheduled_report_id);
CREATE INDEX idx_report_runs_status ON public.report_runs(status);

ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own report runs"
  ON public.report_runs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own report runs"
  ON public.report_runs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);