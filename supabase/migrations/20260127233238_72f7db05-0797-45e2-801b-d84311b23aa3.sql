-- Create deal_memos table for internal deal memos
CREATE TABLE public.deal_memos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  narrative TEXT,
  highlights TEXT,
  hurdles TEXT,
  lender_notes TEXT,
  analyst_notes TEXT,
  other_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(deal_id)
);

-- Enable Row Level Security
ALTER TABLE public.deal_memos ENABLE ROW LEVEL SECURITY;

-- Create policies for company member access
CREATE POLICY "Users can view memos for deals in their company"
ON public.deal_memos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deals d
    JOIN company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_memos.deal_id
    AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert memos for deals in their company"
ON public.deal_memos
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM deals d
    JOIN company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_memos.deal_id
    AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update memos for deals in their company"
ON public.deal_memos
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM deals d
    JOIN company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_memos.deal_id
    AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete memos for deals in their company"
ON public.deal_memos
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM deals d
    JOIN company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_memos.deal_id
    AND cm.user_id = auth.uid()
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_deal_memos_updated_at
BEFORE UPDATE ON public.deal_memos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();