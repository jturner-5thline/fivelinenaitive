
-- QuickBooks Cash Flow mapping rules — admin-editable
CREATE TABLE public.qb_cashflow_mapping_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  priority INTEGER NOT NULL DEFAULT 100,
  match_type TEXT NOT NULL DEFAULT 'include' CHECK (match_type IN ('include','exclude')),
  match_field TEXT NOT NULL DEFAULT 'either' CHECK (match_field IN ('account','item','either')),
  pattern TEXT NOT NULL,
  target_row TEXT,
  categorized BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

CREATE INDEX idx_qb_cashflow_rules_priority ON public.qb_cashflow_mapping_rules(priority, is_active);

ALTER TABLE public.qb_cashflow_mapping_rules ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read (the cash flow hook needs this).
CREATE POLICY "Authenticated can read qb mapping rules"
ON public.qb_cashflow_mapping_rules
FOR SELECT
TO authenticated
USING (true);

-- Only admins can write.
CREATE POLICY "Admins can insert qb mapping rules"
ON public.qb_cashflow_mapping_rules
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update qb mapping rules"
ON public.qb_cashflow_mapping_rules
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete qb mapping rules"
ON public.qb_cashflow_mapping_rules
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE TRIGGER trg_qb_cashflow_rules_updated_at
BEFORE UPDATE ON public.qb_cashflow_mapping_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the current hardcoded rules so behavior is preserved.
-- Lower priority = evaluated first.
INSERT INTO public.qb_cashflow_mapping_rules (priority, match_type, match_field, pattern, target_row, categorized, notes) VALUES
  (10,  'exclude', 'account', 'financial services', NULL, true, 'Exclude FinServ revenue'),
  (11,  'exclude', 'account', 'financing programs', NULL, true, 'Exclude FinServ financing programs'),
  (12,  'exclude', 'account', 'tech ',              NULL, true, 'Exclude Tech revenue'),
  (20,  'include', 'either',  'monthly retainer',   'Retainers',            true,  NULL),
  (21,  'include', 'either',  'retainer',           'Retainers',            true,  NULL),
  (30,  'include', 'either',  'milestone',          'Milestones',           true,  'Check before generic "fee"'),
  (40,  'include', 'either',  'referral',           'Referral Fees',        true,  NULL),
  (50,  'include', 'either',  'closing fee',        'Closing Fees',         true,  NULL),
  (51,  'include', 'either',  'success fee',        'Closing Fees',         true,  NULL),
  (52,  'include', 'either',  'advisory fee',       'Closing Fees',         true,  NULL),
  (53,  'include', 'account', 'debt fee revenue',   'Closing Fees',         true,  'Account prefix match'),
  (54,  'include', 'either',  'consulting fee',     'Closing Fees',         true,  NULL),
  (90,  'include', 'account', 'debt',               'Debt Advisory Revenue', false, 'Fallback bucket for Debt-tagged income'),
  (91,  'include', 'account', 'retainer revenue',   'Debt Advisory Revenue', false, 'Account-prefix fallback'),
  (92,  'include', 'account', 'referral revenue',   'Debt Advisory Revenue', false, 'Account-prefix fallback');
