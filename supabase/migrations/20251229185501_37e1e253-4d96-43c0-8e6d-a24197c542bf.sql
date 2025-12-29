-- Create table for deal status notes history
CREATE TABLE public.deal_status_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.deal_status_notes ENABLE ROW LEVEL SECURITY;

-- Create policies for user access (users can only access notes for their own deals)
CREATE POLICY "Users can view status notes for their deals"
ON public.deal_status_notes
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.deals
  WHERE deals.id = deal_status_notes.deal_id
    AND deals.user_id = auth.uid()
));

CREATE POLICY "Users can create status notes for their deals"
ON public.deal_status_notes
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.deals
  WHERE deals.id = deal_status_notes.deal_id
    AND deals.user_id = auth.uid()
));

CREATE POLICY "Users can delete status notes for their deals"
ON public.deal_status_notes
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.deals
  WHERE deals.id = deal_status_notes.deal_id
    AND deals.user_id = auth.uid()
));

-- Create index for faster queries
CREATE INDEX idx_deal_status_notes_deal_id ON public.deal_status_notes(deal_id);
CREATE INDEX idx_deal_status_notes_created_at ON public.deal_status_notes(created_at DESC);