DROP TABLE IF EXISTS public.report_runs CASCADE;
DROP TABLE IF EXISTS public.recurring_reports CASCADE;
DROP TABLE IF EXISTS public.client_error_log CASCADE;

CREATE TABLE public.recurring_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key   text NOT NULL,
  name         text NOT NULL,
  description  text,
  recipient    text NOT NULL,
  frequency    text NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  last_run_at  timestamptz,
  next_run_at  timestamptz,
  last_preview_html text,
  last_preview_text text,
  last_subject text,
  last_status  text,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX recurring_reports_report_key_unique ON public.recurring_reports(report_key);

ALTER TABLE public.recurring_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view recurring reports"
  ON public.recurring_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can update recurring reports"
  ON public.recurring_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can insert recurring reports"
  ON public.recurring_reports FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_recurring_reports_updated_at
  BEFORE UPDATE ON public.recurring_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.report_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key          text NOT NULL,
  recipient           text NOT NULL,
  subject             text,
  status              text NOT NULL,
  error_message       text,
  rendered_html       text,
  rendered_text       text,
  data_snapshot       jsonb,
  ai_summary          jsonb,
  triggered_by        text NOT NULL DEFAULT 'cron',
  triggered_by_user   uuid,
  period_start        timestamptz,
  period_end          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_runs_key_created ON public.report_runs(report_key, created_at DESC);

ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view report runs"
  ON public.report_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.client_error_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid,
  company_id    uuid,
  feature_area  text,
  error_type    text NOT NULL,
  message       text NOT NULL,
  stack         text,
  url           text,
  user_agent    text,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_error_log_created ON public.client_error_log(created_at DESC);
CREATE INDEX idx_client_error_log_feature ON public.client_error_log(feature_area, created_at DESC);

ALTER TABLE public.client_error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert their own errors"
  ON public.client_error_log FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Admins can view all client errors"
  ON public.client_error_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));