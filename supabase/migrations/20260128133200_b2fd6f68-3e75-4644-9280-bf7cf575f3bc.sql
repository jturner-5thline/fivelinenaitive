-- Create deal_space_financials table for financial documents specific to deals
CREATE TABLE public.deal_space_financials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  user_id UUID REFERENCES auth.users(id),
  notes TEXT,
  fiscal_year INTEGER,
  fiscal_period TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index on deal_id for faster lookups
CREATE INDEX idx_deal_space_financials_deal_id ON public.deal_space_financials(deal_id);

-- Enable RLS
ALTER TABLE public.deal_space_financials ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - users can manage financials for deals they have access to
CREATE POLICY "Users can view financials for deals they own or are in same company"
  ON public.deal_space_financials
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_space_financials.deal_id
        AND (
          d.user_id = auth.uid()
          OR public.is_same_company_as_user(auth.uid(), d.user_id)
        )
    )
  );

CREATE POLICY "Users can insert financials for deals they own or are in same company"
  ON public.deal_space_financials
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_space_financials.deal_id
        AND (
          d.user_id = auth.uid()
          OR public.is_same_company_as_user(auth.uid(), d.user_id)
        )
    )
  );

CREATE POLICY "Users can update financials for deals they own or are in same company"
  ON public.deal_space_financials
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_space_financials.deal_id
        AND (
          d.user_id = auth.uid()
          OR public.is_same_company_as_user(auth.uid(), d.user_id)
        )
    )
  );

CREATE POLICY "Users can delete financials for deals they own or are in same company"
  ON public.deal_space_financials
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_space_financials.deal_id
        AND (
          d.user_id = auth.uid()
          OR public.is_same_company_as_user(auth.uid(), d.user_id)
        )
    )
  );

-- Add updated_at trigger
CREATE TRIGGER update_deal_space_financials_updated_at
  BEFORE UPDATE ON public.deal_space_financials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();