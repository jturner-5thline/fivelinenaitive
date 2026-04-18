-- Create scheduled_cash_flows table for recurring/one-time scheduled cash flow entries
CREATE TABLE IF NOT EXISTS public.scheduled_cash_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID,
  account TEXT NOT NULL,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  frequency_type TEXT NOT NULL CHECK (frequency_type IN ('one_time','weekly','monthly_first','monthly_last','monthly_day')),
  frequency_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  flow_type TEXT NOT NULL CHECK (flow_type IN ('cash_in','cash_out')),
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_cash_flows_company ON public.scheduled_cash_flows(company_id);

ALTER TABLE public.scheduled_cash_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view scheduled cash flows"
ON public.scheduled_cash_flows FOR SELECT
USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can insert scheduled cash flows"
ON public.scheduled_cash_flows FOR INSERT
WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can update scheduled cash flows"
ON public.scheduled_cash_flows FOR UPDATE
USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can delete scheduled cash flows"
ON public.scheduled_cash_flows FOR DELETE
USING (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER trg_scheduled_cash_flows_updated_at
BEFORE UPDATE ON public.scheduled_cash_flows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();