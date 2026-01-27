-- Create deal_ownership table for storing cap table ownership info
CREATE TABLE public.deal_ownership (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  owner_name TEXT NOT NULL,
  ownership_percentage NUMERIC(5,2) NOT NULL CHECK (ownership_percentage >= 0 AND ownership_percentage <= 100),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deal_ownership ENABLE ROW LEVEL SECURITY;

-- Create policies for company members to access ownership data
CREATE POLICY "Users can view ownership for deals in their company"
ON public.deal_ownership
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_ownership.deal_id
    AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert ownership for deals in their company"
ON public.deal_ownership
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_ownership.deal_id
    AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update ownership for deals in their company"
ON public.deal_ownership
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_ownership.deal_id
    AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete ownership for deals in their company"
ON public.deal_ownership
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_ownership.deal_id
    AND cm.user_id = auth.uid()
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_deal_ownership_updated_at
BEFORE UPDATE ON public.deal_ownership
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX idx_deal_ownership_deal_id ON public.deal_ownership(deal_id);