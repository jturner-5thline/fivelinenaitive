
-- Scheduled report definitions
CREATE TABLE public.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  report_type TEXT NOT NULL,
  report_config JSONB NOT NULL DEFAULT '{}',
  schedule_cron TEXT NOT NULL DEFAULT '0 9 * * 1',
  schedule_timezone TEXT DEFAULT 'America/New_York',
  delivery_method TEXT NOT NULL DEFAULT 'slack',
  delivery_config JSONB NOT NULL DEFAULT '{}',
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_reports_user ON public.scheduled_reports(user_id);
CREATE INDEX idx_scheduled_reports_active ON public.scheduled_reports(is_active) WHERE is_active = true;
CREATE INDEX idx_scheduled_reports_next_run ON public.scheduled_reports(next_run_at) WHERE is_active = true;

CREATE TRIGGER update_scheduled_reports_updated_at
  BEFORE UPDATE ON public.scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduled reports"
  ON public.scheduled_reports FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scheduled reports"
  ON public.scheduled_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled reports"
  ON public.scheduled_reports FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled reports"
  ON public.scheduled_reports FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Report run history
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
