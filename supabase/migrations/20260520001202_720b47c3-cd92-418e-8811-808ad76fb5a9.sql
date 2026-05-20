-- Audit trail for manually overridden cash-flow cells.
-- One row per change (set or clear) of a per-week override field.
CREATE TABLE public.cash_flow_override_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  week_key TEXT NOT NULL,
  field TEXT NOT NULL,
  previous_value NUMERIC,
  new_value NUMERIC,
  changed_by UUID,
  changed_by_email TEXT,
  changed_by_name TEXT,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_flow_override_history ENABLE ROW LEVEL SECURITY;

-- Mirror the cash_flow_imports access model: any company member can read,
-- and inserts are restricted to company members for their own company_id.
CREATE POLICY "Company members can view override history"
ON public.cash_flow_override_history
FOR SELECT
USING (is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can insert override history"
ON public.cash_flow_override_history
FOR INSERT
WITH CHECK (
  is_company_member(auth.uid(), company_id)
  AND (changed_by IS NULL OR changed_by = auth.uid())
);

-- Audit rows are immutable — no UPDATE / DELETE policies on purpose.

CREATE INDEX cash_flow_override_history_company_cell_idx
  ON public.cash_flow_override_history (company_id, week_key, field, changed_at DESC);

CREATE INDEX cash_flow_override_history_company_changed_at_idx
  ON public.cash_flow_override_history (company_id, changed_at DESC);