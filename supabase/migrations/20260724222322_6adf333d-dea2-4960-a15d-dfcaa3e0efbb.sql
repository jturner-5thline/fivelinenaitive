
-- Semantic search over Claap transcripts
CREATE TABLE IF NOT EXISTS public.claap_transcript_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id uuid NOT NULL REFERENCES public.claap_transcripts(id) ON DELETE CASCADE,
  claap_meeting_id uuid NOT NULL,
  deal_id uuid NOT NULL,
  chunk_index int NOT NULL,
  chunk_text text NOT NULL,
  embedding vector(1536),
  token_estimate int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transcript_id, chunk_index)
);

GRANT SELECT ON public.claap_transcript_chunks TO authenticated;
GRANT ALL ON public.claap_transcript_chunks TO service_role;

ALTER TABLE public.claap_transcript_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view transcript chunks"
  ON public.claap_transcript_chunks FOR SELECT
  TO authenticated
  USING (
    deal_id IN (
      SELECT d.id FROM public.deals d
      WHERE d.company_id IN (
        SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_claap_chunks_transcript ON public.claap_transcript_chunks(transcript_id);
CREATE INDEX IF NOT EXISTS idx_claap_chunks_deal ON public.claap_transcript_chunks(deal_id);
CREATE INDEX IF NOT EXISTS idx_claap_chunks_embedding
  ON public.claap_transcript_chunks USING hnsw (embedding vector_cosine_ops);

-- Semantic search RPC. Runs as invoker so RLS on chunks / deals scopes results to the caller.
CREATE OR REPLACE FUNCTION public.match_claap_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 8,
  filter_deal_id uuid DEFAULT NULL,
  min_similarity float DEFAULT 0.35
)
RETURNS TABLE (
  chunk_id uuid,
  transcript_id uuid,
  claap_meeting_id uuid,
  deal_id uuid,
  chunk_index int,
  chunk_text text,
  similarity float,
  recorded_at timestamptz,
  meeting_title text,
  deal_company text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id AS chunk_id,
    c.transcript_id,
    c.claap_meeting_id,
    c.deal_id,
    c.chunk_index,
    c.chunk_text,
    1 - (c.embedding <=> query_embedding) AS similarity,
    t.recorded_at,
    m.title AS meeting_title,
    d.company AS deal_company
  FROM public.claap_transcript_chunks c
  JOIN public.claap_transcripts t ON t.id = c.transcript_id
  LEFT JOIN public.claap_meetings m ON m.id = c.claap_meeting_id
  LEFT JOIN public.deals d ON d.id = c.deal_id
  WHERE c.embedding IS NOT NULL
    AND (filter_deal_id IS NULL OR c.deal_id = filter_deal_id)
    AND 1 - (c.embedding <=> query_embedding) >= min_similarity
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_claap_chunks(vector, int, uuid, float) TO authenticated, service_role;

-- Trigger: enqueue embedding job when transcript_text lands / changes
CREATE OR REPLACE FUNCTION public.enqueue_claap_transcript_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text;
  service_key text;
BEGIN
  IF NEW.transcript_text IS NULL OR length(NEW.transcript_text) < 40 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.transcript_text IS NOT DISTINCT FROM NEW.transcript_text THEN
    RETURN NEW;
  END IF;

  fn_url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/embed-claap-transcripts';
  BEGIN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object('transcript_id', NEW.id)
    );
  EXCEPTION WHEN OTHERS THEN
    -- swallow, backfill will catch it
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claap_transcript_embed ON public.claap_transcripts;
CREATE TRIGGER trg_claap_transcript_embed
  AFTER INSERT OR UPDATE OF transcript_text ON public.claap_transcripts
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_claap_transcript_embedding();
