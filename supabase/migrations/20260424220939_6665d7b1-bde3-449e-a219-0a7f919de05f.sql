-- Per-company "Email Style Guide" used to shape AI-drafted email replies.
-- One row per company, admin-managed.
CREATE TABLE public.company_email_style_guide (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  signature text NOT NULL DEFAULT '',
  greeting text NOT NULL DEFAULT '',
  closing text NOT NULL DEFAULT '',
  tone_guidelines text NOT NULL DEFAULT '',
  -- Array of { stage: string, rule: string }
  stage_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  custom_instructions text NOT NULL DEFAULT '',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_email_style_guide ENABLE ROW LEVEL SECURITY;

-- Anyone in the company can READ the style guide (so it can be used in
-- any AI email flow), but only admins/owners can write it.
CREATE POLICY "Members can view their company email style guide"
  ON public.company_email_style_guide
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert their company email style guide"
  ON public.company_email_style_guide
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = company_email_style_guide.company_id
        AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can update their company email style guide"
  ON public.company_email_style_guide
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = company_email_style_guide.company_id
        AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can delete their company email style guide"
  ON public.company_email_style_guide
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = company_email_style_guide.company_id
        AND cm.role IN ('owner', 'admin')
    )
  );

CREATE TRIGGER update_company_email_style_guide_updated_at
  BEFORE UPDATE ON public.company_email_style_guide
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();