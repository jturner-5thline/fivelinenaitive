
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seeded_at timestamptz,
  ADD COLUMN IF NOT EXISTS seed_version text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_skipped boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_companies_is_demo ON public.companies (is_demo) WHERE is_demo = true;
