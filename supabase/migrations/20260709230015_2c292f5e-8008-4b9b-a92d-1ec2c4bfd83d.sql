-- Chunk store for retrieval-augmented KB
CREATE TABLE public.admin_agent_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES public.admin_agent_knowledge_docs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  agent_key text NOT NULL DEFAULT 'admin_agent',
  chunk_index integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  embedding vector(1536),
  token_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_agent_knowledge_chunks TO authenticated;
GRANT ALL ON public.admin_agent_knowledge_chunks TO service_role;

ALTER TABLE public.admin_agent_knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their company's knowledge chunks"
  ON public.admin_agent_knowledge_chunks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = admin_agent_knowledge_chunks.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE INDEX admin_agent_knowledge_chunks_doc_idx
  ON public.admin_agent_knowledge_chunks (doc_id);
CREATE INDEX admin_agent_knowledge_chunks_company_agent_idx
  ON public.admin_agent_knowledge_chunks (company_id, agent_key);
CREATE INDEX admin_agent_knowledge_chunks_embedding_idx
  ON public.admin_agent_knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Retrieval RPC — returns top-N matching chunks joined with their doc title/tags.
CREATE OR REPLACE FUNCTION public.match_admin_agent_knowledge(
  p_company_id uuid,
  p_agent_key text,
  p_query vector(1536),
  p_match_count integer DEFAULT 8,
  p_tag_filter text[] DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  doc_id uuid,
  title text,
  tags text[],
  content text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS chunk_id,
    c.doc_id,
    d.title,
    d.tags,
    c.content,
    1 - (c.embedding <=> p_query) AS similarity
  FROM public.admin_agent_knowledge_chunks c
  JOIN public.admin_agent_knowledge_docs d ON d.id = c.doc_id
  WHERE c.company_id = p_company_id
    AND c.agent_key = p_agent_key
    AND d.status = 'ready'
    AND c.embedding IS NOT NULL
    AND (
      p_tag_filter IS NULL
      OR array_length(p_tag_filter, 1) IS NULL
      OR d.tags && p_tag_filter
    )
  ORDER BY c.embedding <=> p_query
  LIMIT GREATEST(p_match_count, 1);
$$;

GRANT EXECUTE ON FUNCTION public.match_admin_agent_knowledge(uuid, text, vector, integer, text[]) TO authenticated, service_role;