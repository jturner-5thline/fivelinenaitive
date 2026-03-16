
-- Table to store uploaded financial files for multi-file mapping
CREATE TABLE public.deal_financial_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  storage_path TEXT,
  statement_type TEXT NOT NULL DEFAULT 'income_statement',
  start_month INTEGER NOT NULL DEFAULT 1,
  start_year INTEGER NOT NULL DEFAULT 2024,
  month_count INTEGER NOT NULL DEFAULT 12,
  analysis_result JSONB,
  field_mappings JSONB DEFAULT '{}'::jsonb,
  excluded_columns JSONB DEFAULT '[]'::jsonb,
  flipped_rows JSONB DEFAULT '[]'::jsonb,
  flipped_columns JSONB DEFAULT '[]'::jsonb,
  pushed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table to store mapped financial data per file, per month, per account
CREATE TABLE public.deal_financial_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  source_file_id UUID NOT NULL REFERENCES public.deal_financial_files(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL, -- e.g. '2023-11'
  account_key TEXT NOT NULL, -- e.g. 'recurring_revenue', matches IS/BS field path
  account_label TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  pushed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(deal_id, year_month, account_key)
);

-- Enable RLS
ALTER TABLE public.deal_financial_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_financial_data ENABLE ROW LEVEL SECURITY;

-- RLS: company members can manage their deal's financial files
CREATE POLICY "Company members can manage deal financial files"
ON public.deal_financial_files
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_financial_files.deal_id
    AND cm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_financial_files.deal_id
    AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Company members can manage deal financial data"
ON public.deal_financial_data
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_financial_data.deal_id
    AND cm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.deals d
    JOIN public.company_members cm ON cm.company_id = d.company_id
    WHERE d.id = deal_financial_data.deal_id
    AND cm.user_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_deal_financial_files_updated_at
  BEFORE UPDATE ON public.deal_financial_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
