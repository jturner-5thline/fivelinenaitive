-- ============================================================
-- AI file classification storage for the Data Room
-- ============================================================

CREATE TABLE IF NOT EXISTS public.file_ai_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.vdr_documents(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,

  -- File snapshot
  filename TEXT NOT NULL,

  -- Classification job status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  error_message TEXT,

  -- AI output (mirrors the JSON schema)
  detected_document_type TEXT,
  category TEXT
    CHECK (category IS NULL OR category IN (
      'materials', 'financials', 'agreements', 'kpis_metrics', 'other', 'uncategorized'
    )),
  checklist_target TEXT,
  alternate_targets JSONB NOT NULL DEFAULT '[]'::jsonb,
  external_share_recommended BOOLEAN,
  confidence NUMERIC(4,3),
  sensitivity TEXT
    CHECK (sensitivity IS NULL OR sensitivity IN ('low', 'medium', 'high')),
  entities JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT,
  reasoning_short TEXT,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Human review / override tracking
  human_reviewed BOOLEAN NOT NULL DEFAULT false,
  override_category TEXT,
  override_checklist_target TEXT,
  override_external_share BOOLEAN,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,

  -- Audit / debug
  model TEXT,
  raw_response JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One classification record per document (the row is updated on retry)
  CONSTRAINT file_ai_classifications_document_unique UNIQUE (document_id)
);

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_fac_deal_id              ON public.file_ai_classifications(deal_id);
CREATE INDEX IF NOT EXISTS idx_fac_document_id          ON public.file_ai_classifications(document_id);
CREATE INDEX IF NOT EXISTS idx_fac_company_id           ON public.file_ai_classifications(company_id);
CREATE INDEX IF NOT EXISTS idx_fac_checklist_target     ON public.file_ai_classifications(deal_id, checklist_target);
CREATE INDEX IF NOT EXISTS idx_fac_status               ON public.file_ai_classifications(status);

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_fac_updated_at ON public.file_ai_classifications;
CREATE TRIGGER trg_fac_updated_at
  BEFORE UPDATE ON public.file_ai_classifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE public.file_ai_classifications ENABLE ROW LEVEL SECURITY;

-- Anyone in the same company can read classifications for that company's deals
DROP POLICY IF EXISTS "fac_select_company" ON public.file_ai_classifications;
CREATE POLICY "fac_select_company"
  ON public.file_ai_classifications
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL
    OR public.is_company_member(auth.uid(), company_id)
  );

-- Members can insert classification rows for their company's deals
DROP POLICY IF EXISTS "fac_insert_company" ON public.file_ai_classifications;
CREATE POLICY "fac_insert_company"
  ON public.file_ai_classifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IS NULL
    OR public.is_company_member(auth.uid(), company_id)
  );

-- Members can update overrides for their company's classifications
DROP POLICY IF EXISTS "fac_update_company" ON public.file_ai_classifications;
CREATE POLICY "fac_update_company"
  ON public.file_ai_classifications
  FOR UPDATE
  TO authenticated
  USING (
    company_id IS NULL
    OR public.is_company_member(auth.uid(), company_id)
  )
  WITH CHECK (
    company_id IS NULL
    OR public.is_company_member(auth.uid(), company_id)
  );

-- Realtime updates (so UI flips from "Analyzing…" → "Done")
ALTER PUBLICATION supabase_realtime ADD TABLE public.file_ai_classifications;