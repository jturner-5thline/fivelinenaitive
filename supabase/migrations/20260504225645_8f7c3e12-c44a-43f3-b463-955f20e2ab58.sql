-- Lightweight version history for Pipeline Narrative autosaves
CREATE TABLE IF NOT EXISTS public.naitive_pipeline_narrative_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  period_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL
);

CREATE INDEX IF NOT EXISTS idx_nppn_snap_period
  ON public.naitive_pipeline_narrative_snapshots (company_id, period_type, period_key, created_at DESC);

ALTER TABLE public.naitive_pipeline_narrative_snapshots ENABLE ROW LEVEL SECURITY;

-- 5th Line internal users can read/insert/delete snapshots for the 5th Line company.
-- Mirrors access pattern of the parent narratives table (gated app-side to FIFTH_LINE_COMPANY_ID).
CREATE POLICY "Authenticated users can view narrative snapshots"
ON public.naitive_pipeline_narrative_snapshots
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert narrative snapshots"
ON public.naitive_pipeline_narrative_snapshots
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete narrative snapshots"
ON public.naitive_pipeline_narrative_snapshots
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);