
-- pgvector already enabled

-- ─────────────────────────────────────────────────────────────────────────────
-- Reusable AI-extracted lender fit attributes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lender_fit_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_lender_id uuid REFERENCES public.master_lenders(id) ON DELETE CASCADE,
  lender_name text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,

  summary text,                              -- 1-3 sentence narrative profile
  positive_signals jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{signal,confidence}]
  negative_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusions       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- hard dis-fit patterns
  nuanced_preferences jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding vector(1536),                    -- semantic profile vector

  source_hash text,                          -- sha256 of inputs at extraction time
  model_version text,                        -- e.g. 'gemini-3-flash+ada-3-small'
  extracted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lender_fit_attributes_lender_uq
  ON public.lender_fit_attributes (master_lender_id)
  WHERE master_lender_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lender_fit_attributes_company_idx
  ON public.lender_fit_attributes (company_id);

CREATE INDEX IF NOT EXISTS lender_fit_attributes_name_idx
  ON public.lender_fit_attributes (lower(lender_name));

CREATE INDEX IF NOT EXISTS lender_fit_attributes_embedding_idx
  ON public.lender_fit_attributes USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.lender_fit_attributes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view lender fit attributes"
  ON public.lender_fit_attributes FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL
    OR company_id = ANY (get_user_company_ids(auth.uid()))
  );

CREATE POLICY "Members can insert lender fit attributes"
  ON public.lender_fit_attributes FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IS NULL
    OR company_id = ANY (get_user_company_ids(auth.uid()))
  );

CREATE POLICY "Members can update lender fit attributes"
  ON public.lender_fit_attributes FOR UPDATE
  TO authenticated
  USING (
    company_id IS NULL
    OR company_id = ANY (get_user_company_ids(auth.uid()))
  );

CREATE TRIGGER trg_lender_fit_attributes_updated_at
  BEFORE UPDATE ON public.lender_fit_attributes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- Deal narrative embeddings on deal_writeups
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.deal_writeups
  ADD COLUMN IF NOT EXISTS narrative_summary text,
  ADD COLUMN IF NOT EXISTS narrative_embedding vector(1536),
  ADD COLUMN IF NOT EXISTS narrative_source_hash text,
  ADD COLUMN IF NOT EXISTS narrative_embedded_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- Semantic search RPC: returns top N lenders by cosine similarity
-- to a deal narrative embedding.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_lenders_by_narrative(
  query_embedding vector(1536),
  match_count int DEFAULT 50,
  caller_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  master_lender_id uuid,
  lender_name text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lfa.master_lender_id,
    lfa.lender_name,
    1 - (lfa.embedding <=> query_embedding) AS similarity
  FROM public.lender_fit_attributes lfa
  WHERE lfa.embedding IS NOT NULL
    AND (
      caller_company_id IS NULL
      OR lfa.company_id IS NULL
      OR lfa.company_id = caller_company_id
    )
  ORDER BY lfa.embedding <=> query_embedding
  LIMIT match_count;
$$;
