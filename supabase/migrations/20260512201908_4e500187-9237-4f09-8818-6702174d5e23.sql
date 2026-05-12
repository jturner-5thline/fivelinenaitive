
-- Add phase tagging to standard checklist items
ALTER TABLE public.data_room_checklist_items
  ADD COLUMN IF NOT EXISTS phase smallint;

ALTER TABLE public.data_room_checklist_items
  ALTER COLUMN phase SET DEFAULT 2;

-- Backfill any NULL phase to 2 (full DD) per spec
UPDATE public.data_room_checklist_items SET phase = 2 WHERE phase IS NULL;

-- Constrain to valid phases (1, 2, 3) — use NOT VALID then validate to be safe on existing rows
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'data_room_checklist_items_phase_check'
  ) THEN
    ALTER TABLE public.data_room_checklist_items
      ADD CONSTRAINT data_room_checklist_items_phase_check CHECK (phase BETWEEN 1 AND 3);
  END IF;
END $$;

-- Allow archiving (not deleting) outstanding items
ALTER TABLE public.outstanding_items
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- Backfill source_phase = 2 for existing standard-checklist-sourced items so the
-- retroactive bulk-archive UX has something to act on.
UPDATE public.outstanding_items
SET source_metadata = jsonb_set(
  COALESCE(source_metadata, '{}'::jsonb),
  '{source_phase}',
  '2'::jsonb,
  true
)
WHERE source_metadata ? 'source_type'
  AND source_metadata->>'source_type' = 'standard_checklist'
  AND NOT (source_metadata ? 'source_phase');
