
-- Agreement templates (managed by admins)
CREATE TABLE public.agreement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Sections belonging to a template
CREATE TABLE public.agreement_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.agreement_templates(id) ON DELETE CASCADE NOT NULL,
  section_id text NOT NULL,
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('staple', 'configurable', 'optional')),
  enabled boolean DEFAULT true,
  sort_order integer NOT NULL,
  description text,
  template_text text NOT NULL DEFAULT '',
  fields jsonb DEFAULT '[]',
  subsections jsonb DEFAULT NULL,
  qualifiers jsonb DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Drafted agreements (instances created from templates, linked to deals)
CREATE TABLE public.drafted_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.agreement_templates(id),
  deal_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  field_values jsonb DEFAULT '{}',
  section_overrides jsonb DEFAULT '{}',
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'exported')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agreement_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreement_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drafted_agreements ENABLE ROW LEVEL SECURITY;

-- RLS for agreement_templates: all authenticated can select, admins can modify
CREATE POLICY "Anyone can view active agreement templates"
  ON public.agreement_templates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Company admins can insert agreement templates"
  ON public.agreement_templates FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_admin(auth.uid(), company_id) OR public.is_admin(auth.uid())
  );

CREATE POLICY "Company admins can update agreement templates"
  ON public.agreement_templates FOR UPDATE TO authenticated
  USING (
    public.is_company_admin(auth.uid(), company_id) OR public.is_admin(auth.uid())
  );

CREATE POLICY "Company admins can delete agreement templates"
  ON public.agreement_templates FOR DELETE TO authenticated
  USING (
    public.is_company_admin(auth.uid(), company_id) OR public.is_admin(auth.uid())
  );

-- RLS for agreement_sections: all authenticated can select, admins can modify
CREATE POLICY "Anyone can view agreement sections"
  ON public.agreement_sections FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Company admins can insert agreement sections"
  ON public.agreement_sections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agreement_templates t
      WHERE t.id = template_id
      AND (public.is_company_admin(auth.uid(), t.company_id) OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "Company admins can update agreement sections"
  ON public.agreement_sections FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agreement_templates t
      WHERE t.id = template_id
      AND (public.is_company_admin(auth.uid(), t.company_id) OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "Company admins can delete agreement sections"
  ON public.agreement_sections FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agreement_templates t
      WHERE t.id = template_id
      AND (public.is_company_admin(auth.uid(), t.company_id) OR public.is_admin(auth.uid()))
    )
  );

-- RLS for drafted_agreements: users can manage drafts for deals they can access
CREATE POLICY "Users can view own company drafted agreements"
  ON public.drafted_agreements FOR SELECT TO authenticated
  USING (
    public.is_company_member(auth.uid(), company_id) OR public.is_admin(auth.uid())
  );

CREATE POLICY "Users can insert drafted agreements"
  ON public.drafted_agreements FOR INSERT TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id) OR public.is_admin(auth.uid())
  );

CREATE POLICY "Users can update own drafted agreements"
  ON public.drafted_agreements FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid() OR public.is_company_admin(auth.uid(), company_id) OR public.is_admin(auth.uid())
  );

CREATE POLICY "Users can delete own drafted agreements"
  ON public.drafted_agreements FOR DELETE TO authenticated
  USING (
    created_by = auth.uid() OR public.is_company_admin(auth.uid(), company_id) OR public.is_admin(auth.uid())
  );

-- Triggers for updated_at
CREATE TRIGGER update_agreement_templates_updated_at
  BEFORE UPDATE ON public.agreement_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agreement_sections_updated_at
  BEFORE UPDATE ON public.agreement_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_drafted_agreements_updated_at
  BEFORE UPDATE ON public.drafted_agreements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
