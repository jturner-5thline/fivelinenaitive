-- Create master_lenders table for the global lender database
CREATE TABLE public.master_lenders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  
  -- Core lender info
  email TEXT,
  name TEXT NOT NULL,
  lender_type TEXT,
  
  -- Loan parameters
  loan_types TEXT[], -- Array: Full ABL, Inventory, PO, etc.
  sub_debt TEXT,
  cash_burn TEXT,
  sponsorship TEXT,
  
  -- Deal sizing
  min_revenue NUMERIC,
  ebitda_min NUMERIC,
  min_deal NUMERIC,
  max_deal NUMERIC,
  
  -- Industry focus
  industries TEXT[],
  industries_to_avoid TEXT[],
  b2b_b2c TEXT,
  
  -- Requirements & structure
  refinancing TEXT,
  company_requirements TEXT,
  deal_structure_notes TEXT,
  geo TEXT,
  
  -- Contact info
  contact_name TEXT,
  contact_title TEXT,
  relationship_owners TEXT,
  
  -- Documents & agreements
  lender_one_pager_url TEXT,
  referral_lender TEXT,
  referral_fee_offered TEXT,
  referral_agreement TEXT,
  nda TEXT,
  onboarded_to_flex TEXT,
  
  -- Checklists
  upfront_checklist TEXT,
  post_term_sheet_checklist TEXT,
  
  -- Other
  gift_address TEXT,
  external_created_by TEXT,
  external_last_modified TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.master_lenders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Require authentication for master_lenders"
  ON public.master_lenders FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view their own master lenders"
  ON public.master_lenders FOR SELECT
  USING (
    auth.uid() = user_id OR
    (company_id IS NOT NULL AND is_company_member(auth.uid(), company_id))
  );

CREATE POLICY "Users can create master lenders"
  ON public.master_lenders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own master lenders"
  ON public.master_lenders FOR UPDATE
  USING (
    auth.uid() = user_id OR
    (company_id IS NOT NULL AND is_company_member(auth.uid(), company_id))
  );

CREATE POLICY "Users can delete their own master lenders"
  ON public.master_lenders FOR DELETE
  USING (
    auth.uid() = user_id OR
    (company_id IS NOT NULL AND is_company_member(auth.uid(), company_id))
  );

-- Trigger for updated_at
CREATE TRIGGER update_master_lenders_updated_at
  BEFORE UPDATE ON public.master_lenders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_master_lenders_user_id ON public.master_lenders(user_id);
CREATE INDEX idx_master_lenders_company_id ON public.master_lenders(company_id);
CREATE INDEX idx_master_lenders_name ON public.master_lenders(name);