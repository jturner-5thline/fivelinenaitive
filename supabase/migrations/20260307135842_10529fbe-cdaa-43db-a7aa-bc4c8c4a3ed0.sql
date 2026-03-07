
-- Table to store per-company feature/page access overrides
CREATE TABLE public.company_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, feature_key)
);

-- Enable RLS
ALTER TABLE public.company_feature_overrides ENABLE ROW LEVEL SECURITY;

-- Only 5th Line admins can manage these
CREATE POLICY "5thline admins can manage company feature overrides"
  ON public.company_feature_overrides
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Company members can read their own company's overrides
CREATE POLICY "Company members can read their overrides"
  ON public.company_feature_overrides
  FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- Auto-update updated_at
CREATE TRIGGER update_company_feature_overrides_updated_at
  BEFORE UPDATE ON public.company_feature_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
