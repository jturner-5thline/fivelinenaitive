-- Create enum for pass/disqualification reason categories
CREATE TYPE public.lender_pass_reason_category AS ENUM (
  'deal_size_mismatch',
  'industry_exclusion', 
  'geographic_restriction',
  'risk_profile_concerns',
  'timing_issues',
  'relationship_issues',
  'terms_mismatch',
  'other'
);

-- Table to track when lenders are disqualified from deals with reasons
CREATE TABLE public.lender_disqualifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  deal_lender_id UUID REFERENCES public.deal_lenders(id) ON DELETE SET NULL,
  lender_name TEXT NOT NULL,
  master_lender_id UUID REFERENCES public.master_lenders(id) ON DELETE SET NULL,
  disqualified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason_category public.lender_pass_reason_category NOT NULL,
  reason_details TEXT,
  deal_size NUMERIC,
  deal_industry TEXT,
  deal_geography TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table to track lender pass patterns for learning
CREATE TABLE public.lender_pass_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  master_lender_id UUID REFERENCES public.master_lenders(id) ON DELETE CASCADE,
  lender_name TEXT NOT NULL,
  reason_category public.lender_pass_reason_category NOT NULL,
  pattern_type TEXT NOT NULL, -- e.g., 'min_deal_size', 'excluded_industry', etc.
  pattern_value TEXT NOT NULL, -- e.g., '5000000', 'technology', 'california'
  confidence_score NUMERIC DEFAULT 0.5, -- 0-1 based on number of data points
  occurrence_count INTEGER DEFAULT 1,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(master_lender_id, reason_category, pattern_type, pattern_value)
);

-- Create indexes for efficient querying
CREATE INDEX idx_lender_disqualifications_deal ON public.lender_disqualifications(deal_id);
CREATE INDEX idx_lender_disqualifications_master_lender ON public.lender_disqualifications(master_lender_id);
CREATE INDEX idx_lender_disqualifications_lender_name ON public.lender_disqualifications(lender_name);
CREATE INDEX idx_lender_disqualifications_category ON public.lender_disqualifications(reason_category);
CREATE INDEX idx_lender_pass_patterns_lender ON public.lender_pass_patterns(master_lender_id);
CREATE INDEX idx_lender_pass_patterns_lender_name ON public.lender_pass_patterns(lender_name);

-- Enable RLS
ALTER TABLE public.lender_disqualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lender_pass_patterns ENABLE ROW LEVEL SECURITY;

-- RLS policies for lender_disqualifications
CREATE POLICY "Users can view disqualifications for their deals"
ON public.lender_disqualifications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = lender_disqualifications.deal_id
    AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
  )
);

CREATE POLICY "Users can create disqualifications for their deals"
ON public.lender_disqualifications
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_id
    AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
  )
);

CREATE POLICY "Users can delete disqualifications for their deals"
ON public.lender_disqualifications
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = lender_disqualifications.deal_id
    AND (d.user_id = auth.uid() OR public.is_same_company_as_user(auth.uid(), d.user_id))
  )
);

-- RLS policies for lender_pass_patterns (company-wide read, system-managed write)
CREATE POLICY "Authenticated users can view pass patterns"
ON public.lender_pass_patterns
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert pass patterns"
ON public.lender_pass_patterns
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update pass patterns"
ON public.lender_pass_patterns
FOR UPDATE
USING (auth.role() = 'authenticated');

-- Function to update pass patterns when a disqualification is added
CREATE OR REPLACE FUNCTION public.update_lender_pass_patterns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Update or insert pattern based on the disqualification
  INSERT INTO public.lender_pass_patterns (
    master_lender_id,
    lender_name,
    reason_category,
    pattern_type,
    pattern_value,
    confidence_score,
    occurrence_count
  )
  VALUES (
    NEW.master_lender_id,
    NEW.lender_name,
    NEW.reason_category,
    CASE NEW.reason_category
      WHEN 'deal_size_mismatch' THEN 'deal_size_range'
      WHEN 'industry_exclusion' THEN 'excluded_industry'
      WHEN 'geographic_restriction' THEN 'excluded_geography'
      WHEN 'risk_profile_concerns' THEN 'risk_factor'
      ELSE 'general'
    END,
    CASE NEW.reason_category
      WHEN 'deal_size_mismatch' THEN COALESCE(NEW.deal_size::text, 'unknown')
      WHEN 'industry_exclusion' THEN COALESCE(NEW.deal_industry, 'unknown')
      WHEN 'geographic_restriction' THEN COALESCE(NEW.deal_geography, 'unknown')
      ELSE COALESCE(NEW.reason_details, 'unknown')
    END,
    0.5,
    1
  )
  ON CONFLICT (master_lender_id, reason_category, pattern_type, pattern_value)
  DO UPDATE SET
    occurrence_count = lender_pass_patterns.occurrence_count + 1,
    confidence_score = LEAST(0.95, 0.5 + (lender_pass_patterns.occurrence_count * 0.1)),
    last_updated = now();
  
  RETURN NEW;
END;
$$;

-- Create trigger to automatically update patterns
CREATE TRIGGER trigger_update_pass_patterns
AFTER INSERT ON public.lender_disqualifications
FOR EACH ROW
EXECUTE FUNCTION public.update_lender_pass_patterns();