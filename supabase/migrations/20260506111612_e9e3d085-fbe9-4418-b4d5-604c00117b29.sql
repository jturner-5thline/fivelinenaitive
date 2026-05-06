
-- Phase 4: metric targets + anomaly history
CREATE TABLE public.insights_metric_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  metric_label text NOT NULL,
  /** ISO month "YYYY-MM" the target applies to. NULL = applies to every month (default plan). */
  period_month text,
  target_value numeric NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_metric_targets_company ON public.insights_metric_targets(company_id);
CREATE INDEX idx_metric_targets_owner ON public.insights_metric_targets(owner_user_id);
CREATE UNIQUE INDEX uniq_metric_target_period ON public.insights_metric_targets(company_id, metric_key, COALESCE(period_month, ''));

ALTER TABLE public.insights_metric_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage metric targets"
  ON public.insights_metric_targets
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Org members read metric targets"
  ON public.insights_metric_targets
  FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL AND company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE TRIGGER update_insights_metric_targets_updated_at
BEFORE UPDATE ON public.insights_metric_targets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Anomaly / alert history
CREATE TABLE public.insights_anomaly_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  /** stable hash of metric_key + period_key so re-detection updates the same row */
  signature text NOT NULL,
  metric_key text NOT NULL,
  metric_label text NOT NULL,
  period_key text NOT NULL,
  period_label text NOT NULL,
  level text NOT NULL,           -- 'positive' | 'warning' | 'critical'
  message text NOT NULL,
  pct_change numeric,
  abs_change numeric,
  /** Detection / lifecycle */
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  /** User actions */
  dismissed_at timestamptz,
  snoozed_until timestamptz,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_anomaly_history_owner ON public.insights_anomaly_history(owner_user_id);
CREATE INDEX idx_anomaly_history_company ON public.insights_anomaly_history(company_id);
CREATE INDEX idx_anomaly_history_metric ON public.insights_anomaly_history(metric_key);
CREATE UNIQUE INDEX uniq_anomaly_signature ON public.insights_anomaly_history(owner_user_id, signature);

ALTER TABLE public.insights_anomaly_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage anomaly history"
  ON public.insights_anomaly_history
  FOR ALL TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

CREATE TRIGGER update_insights_anomaly_history_updated_at
BEFORE UPDATE ON public.insights_anomaly_history
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
