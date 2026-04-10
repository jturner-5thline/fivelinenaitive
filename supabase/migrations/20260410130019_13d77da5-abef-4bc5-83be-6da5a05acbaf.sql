
CREATE TABLE public.outbound_email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  sequence_name TEXT,
  subject_line TEXT NOT NULL,
  body_rich_text TEXT NOT NULL DEFAULT '',
  body_plain_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, template_number)
);

ALTER TABLE public.outbound_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view outbound email templates"
  ON public.outbound_email_templates FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company admins can create outbound email templates"
  ON public.outbound_email_templates FOR INSERT
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can update outbound email templates"
  ON public.outbound_email_templates FOR UPDATE
  USING (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can delete outbound email templates"
  ON public.outbound_email_templates FOR DELETE
  USING (public.is_company_admin(auth.uid(), company_id));

CREATE TRIGGER update_outbound_email_templates_updated_at
  BEFORE UPDATE ON public.outbound_email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_outbound_email_templates_company ON public.outbound_email_templates(company_id);
CREATE INDEX idx_outbound_email_templates_active ON public.outbound_email_templates(company_id, is_active);
