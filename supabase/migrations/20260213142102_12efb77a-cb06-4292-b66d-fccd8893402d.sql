
-- Create table for deal call transcripts
CREATE TABLE public.deal_call_transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  call_date TIMESTAMPTZ,
  participants TEXT,
  notes TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deal_call_transcripts ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as deal_space_documents)
CREATE POLICY "Users can view call transcripts for deals they have access to"
  ON public.deal_call_transcripts FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert call transcripts"
  ON public.deal_call_transcripts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own call transcripts"
  ON public.deal_call_transcripts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own call transcripts"
  ON public.deal_call_transcripts FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_deal_call_transcripts_updated_at
  BEFORE UPDATE ON public.deal_call_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
