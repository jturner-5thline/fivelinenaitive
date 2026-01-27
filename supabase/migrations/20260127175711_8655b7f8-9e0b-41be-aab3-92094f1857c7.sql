-- Create enum for statement types
CREATE TYPE public.financial_statement_type AS ENUM ('pnl', 'balance_sheet', 'cash_flow');

-- Create enum for period types
CREATE TYPE public.financial_period_type AS ENUM ('monthly', 'quarterly', 'annual');

-- Create financial periods table
CREATE TABLE public.financial_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  period_type public.financial_period_type NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER, -- 1-12 for monthly, NULL for annual
  quarter INTEGER, -- 1-4 for quarterly, NULL for monthly/annual
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID,
  UNIQUE(company_id, period_type, year, month, quarter)
);

-- Create line item categories table
CREATE TABLE public.financial_line_item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  statement_type public.financial_statement_type NOT NULL,
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_system BOOLEAN DEFAULT false,
  parent_category_id UUID REFERENCES public.financial_line_item_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create line item definitions table
CREATE TABLE public.financial_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.financial_line_item_categories(id) ON DELETE CASCADE,
  statement_type public.financial_statement_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_calculated BOOLEAN DEFAULT false,
  calculation_formula TEXT,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create financial data table (actual values)
CREATE TABLE public.financial_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  period_id UUID REFERENCES public.financial_periods(id) ON DELETE CASCADE NOT NULL,
  line_item_id UUID REFERENCES public.financial_line_items(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID,
  UNIQUE(period_id, line_item_id)
);

-- Create change log table for tracking edits
CREATE TABLE public.financial_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  financial_data_id UUID REFERENCES public.financial_data(id) ON DELETE CASCADE NOT NULL,
  period_id UUID REFERENCES public.financial_periods(id) ON DELETE CASCADE NOT NULL,
  line_item_id UUID REFERENCES public.financial_line_items(id) ON DELETE CASCADE NOT NULL,
  previous_amount NUMERIC(15, 2),
  new_amount NUMERIC(15, 2) NOT NULL,
  change_reason TEXT,
  changed_by UUID,
  changed_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financial_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_line_item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_change_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for financial_periods
CREATE POLICY "Company members can view their financial periods"
  ON public.financial_periods FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company admins can manage financial periods"
  ON public.financial_periods FOR ALL
  USING (public.is_company_admin(auth.uid(), company_id));

-- RLS Policies for financial_line_item_categories
CREATE POLICY "Company members can view their categories"
  ON public.financial_line_item_categories FOR SELECT
  USING (company_id IS NULL OR public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company admins can manage their categories"
  ON public.financial_line_item_categories FOR ALL
  USING (company_id IS NULL OR public.is_company_admin(auth.uid(), company_id));

-- RLS Policies for financial_line_items
CREATE POLICY "Company members can view their line items"
  ON public.financial_line_items FOR SELECT
  USING (company_id IS NULL OR public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company admins can manage their line items"
  ON public.financial_line_items FOR ALL
  USING (company_id IS NULL OR public.is_company_admin(auth.uid(), company_id));

-- RLS Policies for financial_data
CREATE POLICY "Company members can view their financial data"
  ON public.financial_data FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can manage their financial data"
  ON public.financial_data FOR ALL
  USING (public.is_company_member(auth.uid(), company_id));

-- RLS Policies for financial_change_logs
CREATE POLICY "Company members can view their change logs"
  ON public.financial_change_logs FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can insert change logs"
  ON public.financial_change_logs FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

-- Create indexes for performance
CREATE INDEX idx_financial_periods_company ON public.financial_periods(company_id);
CREATE INDEX idx_financial_data_period ON public.financial_data(period_id);
CREATE INDEX idx_financial_data_line_item ON public.financial_data(line_item_id);
CREATE INDEX idx_financial_change_logs_data ON public.financial_change_logs(financial_data_id);

-- Trigger to log changes
CREATE OR REPLACE FUNCTION public.log_financial_data_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.amount IS DISTINCT FROM NEW.amount THEN
    INSERT INTO public.financial_change_logs (
      company_id,
      financial_data_id,
      period_id,
      line_item_id,
      previous_amount,
      new_amount,
      changed_by
    ) VALUES (
      NEW.company_id,
      NEW.id,
      NEW.period_id,
      NEW.line_item_id,
      OLD.amount,
      NEW.amount,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_log_financial_data_change
  AFTER UPDATE ON public.financial_data
  FOR EACH ROW
  EXECUTE FUNCTION public.log_financial_data_change();

-- Add updated_at trigger
CREATE TRIGGER update_financial_periods_updated_at
  BEFORE UPDATE ON public.financial_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_financial_data_updated_at
  BEFORE UPDATE ON public.financial_data
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default P&L categories and line items (system defaults)
INSERT INTO public.financial_line_item_categories (statement_type, name, display_order, is_system) VALUES
  ('pnl', 'Revenue', 1, true),
  ('pnl', 'Cost of Goods Sold', 2, true),
  ('pnl', 'Gross Profit', 3, true),
  ('pnl', 'Operating Expenses', 4, true),
  ('pnl', 'Operating Income', 5, true),
  ('pnl', 'Other Income/Expenses', 6, true),
  ('pnl', 'Net Income', 7, true);

-- Insert default Balance Sheet categories
INSERT INTO public.financial_line_item_categories (statement_type, name, display_order, is_system) VALUES
  ('balance_sheet', 'Current Assets', 1, true),
  ('balance_sheet', 'Non-Current Assets', 2, true),
  ('balance_sheet', 'Total Assets', 3, true),
  ('balance_sheet', 'Current Liabilities', 4, true),
  ('balance_sheet', 'Non-Current Liabilities', 5, true),
  ('balance_sheet', 'Total Liabilities', 6, true),
  ('balance_sheet', 'Equity', 7, true);

-- Insert default Cash Flow categories
INSERT INTO public.financial_line_item_categories (statement_type, name, display_order, is_system) VALUES
  ('cash_flow', 'Operating Activities', 1, true),
  ('cash_flow', 'Investing Activities', 2, true),
  ('cash_flow', 'Financing Activities', 3, true),
  ('cash_flow', 'Net Change in Cash', 4, true);