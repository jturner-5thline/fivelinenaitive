
-- SaaS Financial Model data (full model state as JSON per deal)
CREATE TABLE public.deal_saas_model (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE NOT NULL UNIQUE,
  model_data jsonb NOT NULL DEFAULT '{}',
  settings jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- Mapping configurations for uploaded Excel files
CREATE TABLE public.deal_saas_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL,
  file_storage_path text,
  file_size bigint,
  analysis_result jsonb,
  field_mappings jsonb,
  detected_date_cols integer[],
  mapped_at timestamptz DEFAULT now()
);

-- Sensitivity scenarios per deal
CREATE TABLE public.deal_saas_sensitivity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE NOT NULL UNIQUE,
  scenarios jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);

-- Debt servicing lender configs per deal
CREATE TABLE public.deal_saas_lenders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE NOT NULL,
  lender_index integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(deal_id, lender_index)
);

-- Enable RLS
ALTER TABLE public.deal_saas_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_saas_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_saas_sensitivity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_saas_lenders ENABLE ROW LEVEL SECURITY;

-- RLS policies: access through deals table ownership (company-based)
CREATE POLICY "Users can manage own deal saas model" ON public.deal_saas_model
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_saas_model.deal_id AND cm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_saas_model.deal_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "Users can manage own deal saas mappings" ON public.deal_saas_mappings
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_saas_mappings.deal_id AND cm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_saas_mappings.deal_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "Users can manage own deal saas sensitivity" ON public.deal_saas_sensitivity
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_saas_sensitivity.deal_id AND cm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_saas_sensitivity.deal_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "Users can manage own deal saas lenders" ON public.deal_saas_lenders
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_saas_lenders.deal_id AND cm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_saas_lenders.deal_id AND cm.user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_deal_saas_model_deal_id ON public.deal_saas_model(deal_id);
CREATE INDEX idx_deal_saas_mappings_deal_id ON public.deal_saas_mappings(deal_id);
CREATE INDEX idx_deal_saas_sensitivity_deal_id ON public.deal_saas_sensitivity(deal_id);
CREATE INDEX idx_deal_saas_lenders_deal_id ON public.deal_saas_lenders(deal_id);

-- Auto-update timestamps
CREATE TRIGGER update_deal_saas_model_updated_at
  BEFORE UPDATE ON public.deal_saas_model
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deal_saas_sensitivity_updated_at
  BEFORE UPDATE ON public.deal_saas_sensitivity
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deal_saas_lenders_updated_at
  BEFORE UPDATE ON public.deal_saas_lenders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
