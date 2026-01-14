-- Create company_settings table for shared team settings
CREATE TABLE public.company_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  default_deal_stage_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

-- Enable RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Company members can view their company settings
CREATE POLICY "Company members can view settings"
ON public.company_settings
FOR SELECT
USING (public.is_company_member(auth.uid(), company_id));

-- Company admins/owners can update settings
CREATE POLICY "Company admins can update settings"
ON public.company_settings
FOR UPDATE
USING (public.is_company_admin(auth.uid(), company_id));

-- Company admins/owners can insert settings
CREATE POLICY "Company admins can insert settings"
ON public.company_settings
FOR INSERT
WITH CHECK (public.is_company_admin(auth.uid(), company_id));

-- Add updated_at trigger
CREATE TRIGGER update_company_settings_updated_at
BEFORE UPDATE ON public.company_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();