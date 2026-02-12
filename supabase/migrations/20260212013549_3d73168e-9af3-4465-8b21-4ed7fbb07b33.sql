
-- Create deal_space_notes table for Word-like notes
CREATE TABLE public.deal_space_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled Note',
  content TEXT NOT NULL DEFAULT '',
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deal_space_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies - company members can access notes for deals they can access
CREATE POLICY "Users can view notes for accessible deals"
  ON public.deal_space_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_space_notes.deal_id
        AND (
          d.user_id = auth.uid()
          OR public.is_same_company_as_user(auth.uid(), d.user_id)
        )
    )
  );

CREATE POLICY "Users can create notes for accessible deals"
  ON public.deal_space_notes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_space_notes.deal_id
        AND (
          d.user_id = auth.uid()
          OR public.is_same_company_as_user(auth.uid(), d.user_id)
        )
    )
  );

CREATE POLICY "Users can update their own notes"
  ON public.deal_space_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notes"
  ON public.deal_space_notes FOR DELETE
  USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE TRIGGER update_deal_space_notes_updated_at
  BEFORE UPDATE ON public.deal_space_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_space_notes;
