-- Scope insights_agenda by reporting period (month/quarter)
ALTER TABLE public.insights_agenda
  ADD COLUMN IF NOT EXISTS period_type text,
  ADD COLUMN IF NOT EXISTS period_key text;

-- Backfill any existing rows to a sentinel "legacy" period so the NOT NULL
-- constraints can be added without losing data.
UPDATE public.insights_agenda
SET period_type = COALESCE(period_type, 'month'),
    period_key  = COALESCE(period_key, 'legacy')
WHERE period_type IS NULL OR period_key IS NULL;

ALTER TABLE public.insights_agenda
  ALTER COLUMN period_type SET NOT NULL,
  ALTER COLUMN period_key  SET NOT NULL;

-- Replace the old (user_id, company_id) uniqueness with a period-scoped one.
DO $$
DECLARE
  cons record;
BEGIN
  FOR cons IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.insights_agenda'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.insights_agenda DROP CONSTRAINT %I', cons.conname);
  END LOOP;
END$$;

ALTER TABLE public.insights_agenda
  ADD CONSTRAINT insights_agenda_period_unique
  UNIQUE (user_id, company_id, period_type, period_key);

ALTER TABLE public.insights_agenda
  ADD CONSTRAINT insights_agenda_period_type_check
  CHECK (period_type IN ('month', 'quarter'));