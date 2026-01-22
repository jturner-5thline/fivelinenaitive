-- Create table to store linked Claap recordings for deals
CREATE TABLE public.deal_claap_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  recording_id TEXT NOT NULL,
  recording_title TEXT,
  recording_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  recorder_name TEXT,
  recorder_email TEXT,
  linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  linked_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(deal_id, recording_id)
);

-- Enable RLS
ALTER TABLE public.deal_claap_recordings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view claap recordings for deals they can access"
  ON public.deal_claap_recordings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
        AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
    )
  );

CREATE POLICY "Users can link claap recordings to their deals"
  ON public.deal_claap_recordings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
        AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
    )
  );

CREATE POLICY "Users can update claap recordings on their deals"
  ON public.deal_claap_recordings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
        AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
    )
  );

CREATE POLICY "Users can unlink claap recordings from their deals"
  ON public.deal_claap_recordings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_id
        AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
    )
  );

-- Create indexes
CREATE INDEX idx_deal_claap_recordings_deal_id ON public.deal_claap_recordings(deal_id);
CREATE INDEX idx_deal_claap_recordings_recording_id ON public.deal_claap_recordings(recording_id);

-- Add trigger for updated_at
CREATE TRIGGER update_deal_claap_recordings_updated_at
  BEFORE UPDATE ON public.deal_claap_recordings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
