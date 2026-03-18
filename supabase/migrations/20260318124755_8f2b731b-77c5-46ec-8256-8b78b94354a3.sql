
-- Category enum for copilot preferences
CREATE TYPE public.copilot_preference_category AS ENUM ('formatting', 'terminology', 'behavior', 'domain_knowledge');

-- Source tracking
CREATE TYPE public.copilot_preference_source AS ENUM ('manual', 'thumbs_down', 'chat_command');

-- Main table
CREATE TABLE public.copilot_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rule_text TEXT NOT NULL,
  category copilot_preference_category NOT NULL DEFAULT 'behavior',
  source copilot_preference_source NOT NULL DEFAULT 'manual',
  is_active BOOLEAN NOT NULL DEFAULT true,
  original_ai_response TEXT,
  user_correction TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE TRIGGER update_copilot_user_preferences_updated_at
  BEFORE UPDATE ON public.copilot_user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.copilot_user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS: org members can read their org's rules
CREATE POLICY "Members can view org rules"
  ON public.copilot_user_preferences
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- RLS: org members can insert rules for their org
CREATE POLICY "Members can create org rules"
  ON public.copilot_user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- RLS: org admins/owners can update rules
CREATE POLICY "Admins can update org rules"
  ON public.copilot_user_preferences
  FOR UPDATE
  TO authenticated
  USING (
    public.is_company_admin(auth.uid(), organization_id)
    OR public.is_admin(auth.uid())
  );

-- RLS: org admins/owners can delete rules
CREATE POLICY "Admins can delete org rules"
  ON public.copilot_user_preferences
  FOR DELETE
  TO authenticated
  USING (
    public.is_company_admin(auth.uid(), organization_id)
    OR public.is_admin(auth.uid())
  );
