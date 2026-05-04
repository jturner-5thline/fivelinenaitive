
ALTER TABLE public.naitive_pipeline_narratives
  ADD COLUMN IF NOT EXISTS period_type TEXT,
  ADD COLUMN IF NOT EXISTS period_key TEXT,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE;

-- Backfill any existing rows as the current ISO week
UPDATE public.naitive_pipeline_narratives
SET
  period_type = 'week',
  period_key = to_char(CURRENT_DATE, 'IYYY"-W"IW'),
  period_start = (date_trunc('week', CURRENT_DATE))::date,
  period_end = (date_trunc('week', CURRENT_DATE) + interval '6 days')::date
WHERE period_type IS NULL;

ALTER TABLE public.naitive_pipeline_narratives
  ALTER COLUMN period_type SET NOT NULL,
  ALTER COLUMN period_key SET NOT NULL;

-- Drop the legacy single-row unique on company_id, if present
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.naitive_pipeline_narratives'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.naitive_pipeline_narratives DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.naitive_pipeline_narratives
  ADD CONSTRAINT naitive_pipeline_narratives_company_period_uniq
  UNIQUE (company_id, period_type, period_key);

CREATE INDEX IF NOT EXISTS naitive_pipeline_narratives_company_period_idx
  ON public.naitive_pipeline_narratives (company_id, period_type, period_start DESC);
