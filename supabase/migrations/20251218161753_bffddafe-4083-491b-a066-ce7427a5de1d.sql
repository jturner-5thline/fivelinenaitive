-- Create deals table
CREATE TABLE public.deals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  stage TEXT NOT NULL DEFAULT 'Initial Review',
  engagement_type TEXT,
  deal_type TEXT,
  referred_by TEXT,
  manager TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create deal_lenders table
CREATE TABLE public.deal_lenders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'Initial Outreach',
  substage TEXT,
  notes TEXT,
  pass_reason TEXT,
  quote_amount NUMERIC,
  quote_rate NUMERIC,
  quote_term TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create outstanding_items table
CREATE TABLE public.outstanding_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE NOT NULL,
  lender_id UUID REFERENCES public.deal_lenders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  due_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_lenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outstanding_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for deals (public access for now)
CREATE POLICY "Anyone can view deals" ON public.deals FOR SELECT USING (true);
CREATE POLICY "Anyone can create deals" ON public.deals FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update deals" ON public.deals FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete deals" ON public.deals FOR DELETE USING (true);

-- RLS policies for deal_lenders
CREATE POLICY "Anyone can view deal_lenders" ON public.deal_lenders FOR SELECT USING (true);
CREATE POLICY "Anyone can create deal_lenders" ON public.deal_lenders FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update deal_lenders" ON public.deal_lenders FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete deal_lenders" ON public.deal_lenders FOR DELETE USING (true);

-- RLS policies for outstanding_items
CREATE POLICY "Anyone can view outstanding_items" ON public.outstanding_items FOR SELECT USING (true);
CREATE POLICY "Anyone can create outstanding_items" ON public.outstanding_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update outstanding_items" ON public.outstanding_items FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete outstanding_items" ON public.outstanding_items FOR DELETE USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_deal_lenders_updated_at BEFORE UPDATE ON public.deal_lenders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_outstanding_items_updated_at BEFORE UPDATE ON public.outstanding_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();