-- Create table for lender stage configuration
CREATE TABLE public.lender_stage_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  substages JSONB NOT NULL DEFAULT '[]'::jsonb,
  pass_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Unique constraint: one config per company (or per user if no company)
  UNIQUE(company_id),
  UNIQUE(user_id) -- Fallback for users without a company
);

-- Enable RLS
ALTER TABLE public.lender_stage_configs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their company's config or their own personal config
CREATE POLICY "Users can view their lender stage config"
  ON public.lender_stage_configs
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id))
  );

-- Policy: Users can insert their own config (will be associated with their company if they have one)
CREATE POLICY "Users can insert their lender stage config"
  ON public.lender_stage_configs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy: Company admins or the config owner can update
CREATE POLICY "Users can update their lender stage config"
  ON public.lender_stage_configs
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (company_id IS NOT NULL AND public.is_company_admin(auth.uid(), company_id))
  );

-- Policy: Company admins or config owner can delete
CREATE POLICY "Users can delete their lender stage config"
  ON public.lender_stage_configs
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR (company_id IS NOT NULL AND public.is_company_admin(auth.uid(), company_id))
  );

-- Add updated_at trigger
CREATE TRIGGER update_lender_stage_configs_updated_at
  BEFORE UPDATE ON public.lender_stage_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();