ALTER TABLE public.cash_flow_imports
ADD COLUMN IF NOT EXISTS weekly_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;