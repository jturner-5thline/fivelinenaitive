-- Create table for lender notes history
CREATE TABLE public.lender_notes_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_lender_id UUID NOT NULL REFERENCES public.deal_lenders(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.lender_notes_history ENABLE ROW LEVEL SECURITY;

-- RLS policies: Users can only access notes history for their own deal's lenders
CREATE POLICY "Users can view notes history for their deal lenders"
ON public.lender_notes_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deal_lenders dl
    JOIN deals d ON d.id = dl.deal_id
    WHERE dl.id = lender_notes_history.deal_lender_id
    AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create notes history for their deal lenders"
ON public.lender_notes_history
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM deal_lenders dl
    JOIN deals d ON d.id = dl.deal_id
    WHERE dl.id = lender_notes_history.deal_lender_id
    AND d.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete notes history for their deal lenders"
ON public.lender_notes_history
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM deal_lenders dl
    JOIN deals d ON d.id = dl.deal_id
    WHERE dl.id = lender_notes_history.deal_lender_id
    AND d.user_id = auth.uid()
  )
);