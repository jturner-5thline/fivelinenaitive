
-- Create company_features table for company-level feature flags
CREATE TABLE public.company_features (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workflows_enabled BOOLEAN NOT NULL DEFAULT false,
  timeline_view_enabled BOOLEAN NOT NULL DEFAULT false,
  agreement_icon_visible BOOLEAN NOT NULL DEFAULT false,
  deal_memo_enabled BOOLEAN NOT NULL DEFAULT false,
  sample_deal_on_signup BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

-- Enable RLS
ALTER TABLE public.company_features ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read their own company's features
CREATE POLICY "Users can view own company features"
ON public.company_features
FOR SELECT
TO authenticated
USING (
  company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  OR public.is_admin(auth.uid())
);

-- Only platform admins can insert/update/delete
CREATE POLICY "Admins can insert company features"
ON public.company_features
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update company features"
ON public.company_features
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete company features"
ON public.company_features
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_company_features_updated_at
BEFORE UPDATE ON public.company_features
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create a function to auto-create company_features row when a company is created
CREATE OR REPLACE FUNCTION public.auto_create_company_features()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_5thline BOOLEAN;
BEGIN
  -- Check if any member of this company has a 5thline.co email
  -- For new companies, we check the primary domain
  is_5thline := (NEW.primary_domain = '5thline.co' OR NEW.name ILIKE '%5th line%' OR NEW.name ILIKE '%5thline%');
  
  INSERT INTO public.company_features (company_id, workflows_enabled, timeline_view_enabled, agreement_icon_visible, deal_memo_enabled, sample_deal_on_signup)
  VALUES (
    NEW.id,
    is_5thline, is_5thline, is_5thline, is_5thline,
    true -- sample deal always defaults to true
  )
  ON CONFLICT (company_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_create_company_features_trigger
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_company_features();

-- Seed existing companies with feature rows
-- 5thLine company gets all features enabled
INSERT INTO public.company_features (company_id, workflows_enabled, timeline_view_enabled, agreement_icon_visible, deal_memo_enabled, sample_deal_on_signup)
SELECT c.id, 
  (c.primary_domain = '5thline.co' OR c.name ILIKE '%5th line%' OR c.name ILIKE '%5thline%'),
  (c.primary_domain = '5thline.co' OR c.name ILIKE '%5th line%' OR c.name ILIKE '%5thline%'),
  (c.primary_domain = '5thline.co' OR c.name ILIKE '%5th line%' OR c.name ILIKE '%5thline%'),
  (c.primary_domain = '5thline.co' OR c.name ILIKE '%5th line%' OR c.name ILIKE '%5thline%'),
  true
FROM public.companies c
ON CONFLICT (company_id) DO NOTHING;
