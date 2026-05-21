
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS ai_status_snapshot jsonb;

CREATE TABLE IF NOT EXISTS public.deal_ai_status_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  header_status text,
  derived_status text,
  mismatch boolean NOT NULL DEFAULT false,
  rationale text,
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'ask_ai',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_ai_status_snapshots_deal_created
  ON public.deal_ai_status_snapshots(deal_id, created_at DESC);

ALTER TABLE public.deal_ai_status_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View snapshots for accessible deals"
  ON public.deal_ai_status_snapshots;
CREATE POLICY "View snapshots for accessible deals"
  ON public.deal_ai_status_snapshots
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_ai_status_snapshots.deal_id
    )
  );

DROP POLICY IF EXISTS "Insert snapshots for accessible deals"
  ON public.deal_ai_status_snapshots;
CREATE POLICY "Insert snapshots for accessible deals"
  ON public.deal_ai_status_snapshots
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_ai_status_snapshots.deal_id
    )
  );
