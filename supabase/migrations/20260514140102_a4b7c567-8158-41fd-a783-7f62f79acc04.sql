-- Allow default_milestones to also be triggered when a deal enters a specific pipeline stage.
ALTER TABLE public.default_milestones
  ADD COLUMN IF NOT EXISTS trigger_stage text,
  ADD COLUMN IF NOT EXISTS days_from_stage integer;

-- Drop legacy timing_type CHECK if it exists, then re-add allowing the new value.
DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.default_milestones'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%timing_type%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.default_milestones DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE public.default_milestones
  ADD CONSTRAINT default_milestones_timing_type_check
  CHECK (timing_type IN ('from_creation', 'after_previous', 'from_stage_entry'));

-- Helpful index for the stage-trigger lookup.
CREATE INDEX IF NOT EXISTS default_milestones_company_stage_idx
  ON public.default_milestones (company_id, trigger_stage)
  WHERE timing_type = 'from_stage_entry';

-- Seed the 5th Line stage-triggered milestones (idempotent).
INSERT INTO public.default_milestones
  (company_id, title, days_from_creation, timing_type, position, trigger_stage, days_from_stage)
SELECT '44556c46-9127-4b12-b14e-d6fee784afcf', t.title, NULL, 'from_stage_entry', t.position, t.trigger_stage, t.days_from_stage
FROM (VALUES
  ('Client Signed',        100, 'proposal-issued',      14),
  ('Submit to Lenders',    101, 'final-credit-items',   14),
  ('First Management Call',102, 'submitted-to-lenders', 10),
  ('First Term Sheets',    103, 'submitted-to-lenders', 21),
  ('Term Sheet Signed',    104, 'submitted-to-lenders', NULL)
) AS t(title, position, trigger_stage, days_from_stage)
WHERE NOT EXISTS (
  SELECT 1 FROM public.default_milestones d
  WHERE d.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
    AND d.timing_type = 'from_stage_entry'
    AND d.trigger_stage = t.trigger_stage
    AND lower(d.title) = lower(t.title)
);