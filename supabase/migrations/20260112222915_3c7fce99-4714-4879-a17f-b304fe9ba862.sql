-- Create deal_writeups table to store deal write-up information
CREATE TABLE public.deal_writeups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  company_url TEXT DEFAULT '',
  linkedin_url TEXT DEFAULT '',
  data_room_url TEXT DEFAULT '',
  industry TEXT DEFAULT '',
  location TEXT DEFAULT '',
  deal_type TEXT DEFAULT '',
  billing_model TEXT DEFAULT '',
  profitability TEXT DEFAULT '',
  gross_margins TEXT DEFAULT '',
  capital_ask TEXT DEFAULT '',
  this_year_revenue TEXT DEFAULT '',
  last_year_revenue TEXT DEFAULT '',
  financial_data_as_of TIMESTAMP WITH TIME ZONE,
  accounting_system TEXT DEFAULT '',
  status TEXT DEFAULT 'Draft',
  use_of_funds TEXT DEFAULT '',
  existing_debt_details TEXT DEFAULT '',
  description TEXT DEFAULT '',
  key_items JSONB DEFAULT '[]'::jsonb,
  publish_as_anonymous BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(deal_id)
);

-- Enable RLS
ALTER TABLE public.deal_writeups ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Require authentication for deal_writeups"
ON public.deal_writeups
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view writeups for their deals"
ON public.deal_writeups
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_writeups.deal_id
    AND (
      deals.user_id = auth.uid()
      OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id))
    )
  )
);

CREATE POLICY "Users can create writeups for their deals"
ON public.deal_writeups
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_writeups.deal_id
    AND (
      deals.user_id = auth.uid()
      OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id))
    )
  )
);

CREATE POLICY "Users can update writeups for their deals"
ON public.deal_writeups
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_writeups.deal_id
    AND (
      deals.user_id = auth.uid()
      OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id))
    )
  )
);

CREATE POLICY "Users can delete writeups for their deals"
ON public.deal_writeups
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = deal_writeups.deal_id
    AND (
      deals.user_id = auth.uid()
      OR (deals.company_id IS NOT NULL AND is_company_member(auth.uid(), deals.company_id))
    )
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_deal_writeups_updated_at
BEFORE UPDATE ON public.deal_writeups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();