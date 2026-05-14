CREATE TABLE public.deal_space_note_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID,
  created_by UUID NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  icon TEXT DEFAULT '📝',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.deal_space_note_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view templates in their company"
ON public.deal_space_note_templates FOR SELECT
USING (
  company_id IS NULL
  OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can create templates in their company"
ON public.deal_space_note_templates FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND (
    company_id IS NULL
    OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Users can update templates in their company"
ON public.deal_space_note_templates FOR UPDATE
USING (
  company_id IS NULL
  OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete templates in their company"
ON public.deal_space_note_templates FOR DELETE
USING (
  company_id IS NULL
  OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
);

CREATE TRIGGER update_deal_space_note_templates_updated_at
BEFORE UPDATE ON public.deal_space_note_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_deal_space_note_templates_company ON public.deal_space_note_templates(company_id);