
-- Table to store per-deal timeline/pipeline configuration
CREATE TABLE public.deal_pipeline_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(deal_id)
);

-- Enable RLS
ALTER TABLE public.deal_pipeline_configs ENABLE ROW LEVEL SECURITY;

-- RLS policies - company members can read/write configs for their deals
CREATE POLICY "Users can view pipeline configs for their company deals"
ON public.deal_pipeline_configs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_pipeline_configs.deal_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert pipeline configs for their company deals"
ON public.deal_pipeline_configs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_pipeline_configs.deal_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update pipeline configs for their company deals"
ON public.deal_pipeline_configs
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_pipeline_configs.deal_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete pipeline configs for their company deals"
ON public.deal_pipeline_configs
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_pipeline_configs.deal_id
      AND cm.user_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_deal_pipeline_configs_updated_at
BEFORE UPDATE ON public.deal_pipeline_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
