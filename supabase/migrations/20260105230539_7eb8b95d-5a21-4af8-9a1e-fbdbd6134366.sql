-- Create a table for flag notes history
CREATE TABLE public.deal_flag_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.deal_flag_notes ENABLE ROW LEVEL SECURITY;

-- Create policies for company-based access (matching deals table pattern)
CREATE POLICY "Users can view flag notes for deals in their company"
ON public.deal_flag_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_flag_notes.deal_id
    AND d.company_id = public.get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Users can create flag notes for deals in their company"
ON public.deal_flag_notes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_flag_notes.deal_id
    AND d.company_id = public.get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Users can delete flag notes for deals in their company"
ON public.deal_flag_notes
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_flag_notes.deal_id
    AND d.company_id = public.get_user_company_id(auth.uid())
  )
);

-- Create index for faster lookups
CREATE INDEX idx_deal_flag_notes_deal_id ON public.deal_flag_notes(deal_id);