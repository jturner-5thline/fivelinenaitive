
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_by uuid,
  ADD COLUMN IF NOT EXISTS demo_warning_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_companies_trial_status
  ON public.companies (trial_ends_at)
  WHERE subscription_status = 'trialing';
