
-- Optimize Ask nAItive semantic retrieval over Claap transcripts.
-- 1) Rebuild HNSW as a partial index with tuned build params (better recall
--    at higher volume, smaller index footprint).
-- 2) Rewrite match_claap_chunks to:
--      a) fetch top-K candidates via HNSW ORDER BY + LIMIT (index-friendly),
--      b) filter by similarity threshold in an outer step,
--      c) set a per-transaction hnsw.ef_search so recall stays consistent
--         as the corpus grows.
-- 3) Add supporting btree indexes for common filter paths (deal_id + recency,
--    meeting_id) and refresh planner stats.

-- (1) HNSW rebuild ---------------------------------------------------------
DROP INDEX IF EXISTS public.idx_claap_chunks_embedding;

CREATE INDEX idx_claap_chunks_embedding
  ON public.claap_transcript_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 96)
  WHERE embedding IS NOT NULL;

-- (3a) supporting btree indexes -------------------------------------------
CREATE INDEX IF NOT EXISTS idx_claap_chunks_deal_recent
  ON public.claap_transcript_chunks (deal_id, created_at DESC)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_claap_chunks_meeting
  ON public.claap_transcript_chunks (claap_meeting_id)
  WHERE embedding IS NOT NULL;

-- (2) Rewritten RPC --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_claap_chunks(
  query_embedding vector,
  match_count integer DEFAULT 8,
  filter_deal_id uuid DEFAULT NULL,
  min_similarity double precision DEFAULT 0.35,
  ef_search integer DEFAULT 80
)
RETURNS TABLE (
  chunk_id uuid,
  transcript_id uuid,
  claap_meeting_id uuid,
  deal_id uuid,
  chunk_index integer,
  chunk_text text,
  similarity double precision,
  recorded_at timestamptz,
  meeting_title text,
  deal_company text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  -- Over-fetch from the index so post-filtering by min_similarity still
  -- returns a full page. Clamp to a sane ceiling.
  candidate_k integer := LEAST(GREATEST(match_count * 4, 32), 200);
BEGIN
  -- Tune HNSW recall for this statement only. Higher ef_search = better
  -- recall at slightly higher latency; scales gracefully with corpus size.
  PERFORM set_config('hnsw.ef_search', GREATEST(ef_search, match_count)::text, true);

  RETURN QUERY
  WITH candidates AS (
    SELECT
      c.id,
      c.transcript_id,
      c.claap_meeting_id,
      c.deal_id,
      c.chunk_index,
      c.chunk_text,
      c.embedding <=> query_embedding AS distance
    FROM public.claap_transcript_chunks c
    WHERE c.embedding IS NOT NULL
      AND (filter_deal_id IS NULL OR c.deal_id = filter_deal_id)
    ORDER BY c.embedding <=> query_embedding
    LIMIT candidate_k
  )
  SELECT
    cand.id AS chunk_id,
    cand.transcript_id,
    cand.claap_meeting_id,
    cand.deal_id,
    cand.chunk_index,
    cand.chunk_text,
    (1 - cand.distance)::double precision AS similarity,
    t.recorded_at,
    m.title AS meeting_title,
    d.company AS deal_company
  FROM candidates cand
  JOIN public.claap_transcripts t ON t.id = cand.transcript_id
  LEFT JOIN public.claap_meetings m ON m.id = cand.claap_meeting_id
  LEFT JOIN public.deals d ON d.id = cand.deal_id
  WHERE (1 - cand.distance) >= min_similarity
  ORDER BY cand.distance
  LIMIT match_count;
END;
$$;

-- (3b) refresh stats so the planner picks the new index shapes -----------
ANALYZE public.claap_transcript_chunks;
