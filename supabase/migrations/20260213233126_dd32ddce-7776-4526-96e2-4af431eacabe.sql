
-- Create deal_pipelines table
CREATE TABLE public.deal_pipelines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add pipeline_id to deals (nullable for backwards compatibility)
ALTER TABLE public.deals ADD COLUMN pipeline_id UUID REFERENCES public.deal_pipelines(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.deal_pipelines ENABLE ROW LEVEL SECURITY;

-- RLS: Company members can view pipelines
CREATE POLICY "Company members can view pipelines"
ON public.deal_pipelines FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_members.user_id = auth.uid()
      AND company_members.company_id = deal_pipelines.company_id
  )
);

-- RLS: Company members can insert pipelines
CREATE POLICY "Company members can insert pipelines"
ON public.deal_pipelines FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_members.user_id = auth.uid()
      AND company_members.company_id = deal_pipelines.company_id
  )
);

-- RLS: Company members can update pipelines
CREATE POLICY "Company members can update pipelines"
ON public.deal_pipelines FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_members.user_id = auth.uid()
      AND company_members.company_id = deal_pipelines.company_id
  )
);

-- RLS: Company admins can delete pipelines
CREATE POLICY "Company admins can delete pipelines"
ON public.deal_pipelines FOR DELETE
USING (
  public.is_company_admin(auth.uid(), company_id)
);

-- Trigger for updated_at
CREATE TRIGGER update_deal_pipelines_updated_at
BEFORE UPDATE ON public.deal_pipelines
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Ensure only one default pipeline per company
CREATE UNIQUE INDEX idx_deal_pipelines_default 
ON public.deal_pipelines (company_id) 
WHERE is_default = true;
