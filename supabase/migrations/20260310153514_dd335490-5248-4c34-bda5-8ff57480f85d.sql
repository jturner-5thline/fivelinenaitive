
-- Model Snapshots for versioning
CREATE TABLE public.model_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL,
  user_id UUID NOT NULL,
  label TEXT NOT NULL DEFAULT 'Snapshot',
  description TEXT,
  model_data JSONB NOT NULL,
  sensitivity_data JSONB,
  lender_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_model_snapshots_deal ON public.model_snapshots(deal_id, created_at DESC);

ALTER TABLE public.model_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view snapshots for deals they can access"
  ON public.model_snapshots FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create snapshots"
  ON public.model_snapshots FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own snapshots"
  ON public.model_snapshots FOR DELETE TO authenticated
  USING (user_id = auth.uid());
