
-- Create claap_transcripts table for AI copilot indexing
CREATE TABLE IF NOT EXISTS public.claap_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE NOT NULL,
  claap_meeting_id uuid REFERENCES public.claap_meetings(id) ON DELETE CASCADE NOT NULL,
  transcript_text text,
  summary text,
  participants jsonb DEFAULT '[]'::jsonb,
  duration_seconds integer,
  recorded_at timestamptz,
  call_type text,
  match_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(claap_meeting_id)
);

ALTER TABLE public.claap_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view deal transcripts"
ON public.claap_transcripts FOR SELECT TO authenticated
USING (
  deal_id IN (
    SELECT d.id FROM public.deals d
    WHERE d.company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  )
);
