
-- Create column type enum
CREATE TYPE public.financial_column_type AS ENUM ('actual', 'projection');

-- Create financial_column_settings table
CREATE TABLE public.financial_column_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  column_key TEXT NOT NULL,
  column_type financial_column_type NOT NULL DEFAULT 'actual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, column_key)
);

-- Enable RLS
ALTER TABLE public.financial_column_settings ENABLE ROW LEVEL SECURITY;

-- RLS: company members can read
CREATE POLICY "Company members can read column settings"
  ON public.financial_column_settings
  FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- RLS: company members can insert
CREATE POLICY "Company members can insert column settings"
  ON public.financial_column_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

-- RLS: company members can update
CREATE POLICY "Company members can update column settings"
  ON public.financial_column_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- RLS: company members can delete
CREATE POLICY "Company members can delete column settings"
  ON public.financial_column_settings
  FOR DELETE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- Index for fast lookups
CREATE INDEX idx_financial_column_settings_company ON public.financial_column_settings(company_id);
