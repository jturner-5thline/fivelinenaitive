ALTER TABLE public.deal_writeups
  ADD COLUMN IF NOT EXISTS existing_debt_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS existing_debt_legacy_dismissed BOOLEAN NOT NULL DEFAULT false;