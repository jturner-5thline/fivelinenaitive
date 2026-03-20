
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Document chunks with embeddings for RAG
CREATE TABLE public.vdr_document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.vdr_documents(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL,
  company_id UUID,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  chunk_text TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vdr_chunks_document ON public.vdr_document_chunks(document_id);
CREATE INDEX idx_vdr_chunks_deal ON public.vdr_document_chunks(deal_id);

-- Document entities extracted by AI
CREATE TABLE public.vdr_document_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.vdr_documents(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_value TEXT NOT NULL,
  context_snippet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vdr_entities_document ON public.vdr_document_entities(document_id);

-- Document account category tags
CREATE TABLE public.vdr_document_account_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.vdr_documents(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL,
  account_category TEXT NOT NULL,
  confidence_score NUMERIC(3,2) DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vdr_tags_document ON public.vdr_document_account_tags(document_id);

-- Add ingestion columns to vdr_documents
ALTER TABLE public.vdr_documents 
  ADD COLUMN IF NOT EXISTS ingestion_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entity_count INTEGER DEFAULT 0;

-- RLS for all new tables
ALTER TABLE public.vdr_document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vdr_document_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vdr_document_account_tags ENABLE ROW LEVEL SECURITY;

-- RLS policies - company members can read chunks for their deals
CREATE POLICY "Company members can read chunks" ON public.vdr_document_chunks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid() AND cm.company_id = vdr_document_chunks.company_id
    )
  );

CREATE POLICY "Company members can insert chunks" ON public.vdr_document_chunks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid() AND cm.company_id = vdr_document_chunks.company_id
    )
  );

CREATE POLICY "Company members can read entities" ON public.vdr_document_entities
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vdr_documents d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = vdr_document_entities.document_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can insert entities" ON public.vdr_document_entities
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vdr_documents d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = vdr_document_entities.document_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can read account tags" ON public.vdr_document_account_tags
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vdr_documents d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = vdr_document_account_tags.document_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can insert account tags" ON public.vdr_document_account_tags
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.vdr_documents d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = vdr_document_account_tags.document_id AND cm.user_id = auth.uid()
    )
  );

-- Similarity search function
CREATE OR REPLACE FUNCTION public.vdr_search_chunks(
  _deal_id UUID,
  _query_embedding vector(1536),
  _match_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  document_id UUID,
  chunk_text TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    c.id,
    c.document_id,
    c.chunk_text,
    c.metadata,
    1 - (c.embedding <=> _query_embedding) AS similarity
  FROM public.vdr_document_chunks c
  WHERE c.deal_id = _deal_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> _query_embedding
  LIMIT _match_count;
$$;
