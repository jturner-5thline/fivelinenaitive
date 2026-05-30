
-- ============================================================
-- Stage-history schema hardening for entry+exit Activity events
-- ============================================================

-- 1) New columns (idempotent)
ALTER TABLE public.deal_stage_history
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS from_stage_id text,
  ADD COLUMN IF NOT EXISTS from_stage_label_raw text;

-- 2) Backfill event_type for existing rows
--    - 'backfill_exit' rows are stage_exit; move to_stage_id -> from_stage_id
--    - everything else is stage_enter
UPDATE public.deal_stage_history
SET event_type = 'stage_exit',
    from_stage_id        = COALESCE(from_stage_id, to_stage_id),
    from_stage_label_raw = COALESCE(from_stage_label_raw, to_stage_label_raw),
    from_stage           = COALESCE(from_stage, to_stage)
WHERE source = 'backfill_exit' AND event_type IS NULL;

-- For exit rows, the "to_stage_id" is meaningless (the stage they LEFT).
-- Null it out so the activity renderer doesn't display "Entered X" for an exit.
UPDATE public.deal_stage_history
SET to_stage_id = NULL,
    to_stage_label_raw = NULL
WHERE source = 'backfill_exit' AND event_type = 'stage_exit';

UPDATE public.deal_stage_history
SET event_type = 'stage_enter'
WHERE event_type IS NULL;

-- 3) Default + constraint going forward
ALTER TABLE public.deal_stage_history
  ALTER COLUMN event_type SET DEFAULT 'stage_enter';

DO $$ BEGIN
  ALTER TABLE public.deal_stage_history
    ADD CONSTRAINT deal_stage_history_event_type_chk
    CHECK (event_type IN ('stage_enter','stage_exit'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Indexes for activity feed perf
CREATE INDEX IF NOT EXISTS idx_dsh_deal_enter
  ON public.deal_stage_history (deal_id, to_stage_id, changed_at DESC)
  WHERE event_type = 'stage_enter';

CREATE INDEX IF NOT EXISTS idx_dsh_deal_exit
  ON public.deal_stage_history (deal_id, from_stage_id, exited_at DESC)
  WHERE event_type = 'stage_exit';

CREATE INDEX IF NOT EXISTS idx_dsh_deal_changed_at
  ON public.deal_stage_history (deal_id, changed_at DESC);

-- 5) Guardrail trigger: when stage_id is set on an enter/exit row, it must
--    correspond to a real stage in the deal's account pipelines.
CREATE OR REPLACE FUNCTION public.deal_stage_history_guardrail()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_stage_id text;
  v_exists boolean;
BEGIN
  IF NEW.event_type = 'stage_enter' THEN
    v_stage_id := NEW.to_stage_id;
  ELSIF NEW.event_type = 'stage_exit' THEN
    v_stage_id := NEW.from_stage_id;
  ELSE
    v_stage_id := NULL;
  END IF;

  IF v_stage_id IS NULL THEN
    RETURN NEW; -- unresolved row is allowed; renderer hides it
  END IF;

  v_company := NEW.company_id;
  IF v_company IS NULL THEN
    SELECT company_id INTO v_company FROM public.deals WHERE id = NEW.deal_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.deal_pipelines p, jsonb_array_elements(p.stages) s
    WHERE p.company_id = v_company
      AND (s->>'id') = v_stage_id
      AND (NEW.pipeline_id IS NULL OR p.id = NEW.pipeline_id)
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION
      'deal_stage_history guardrail: stage_id % is not a valid stage for company % (deal %, event_type %)',
      v_stage_id, v_company, NEW.deal_id, NEW.event_type;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dsh_guardrail ON public.deal_stage_history;
CREATE TRIGGER trg_dsh_guardrail
  BEFORE INSERT OR UPDATE OF to_stage_id, from_stage_id, event_type, pipeline_id, deal_id
  ON public.deal_stage_history
  FOR EACH ROW EXECUTE FUNCTION public.deal_stage_history_guardrail();

-- 6) Analytics view: paired enter+exit per (deal, stage)
DROP VIEW IF EXISTS public.v_deal_stage_transitions;
CREATE VIEW public.v_deal_stage_transitions AS
WITH enters AS (
  SELECT deal_id, pipeline_id, to_stage_id AS stage_id, changed_at AS entered_at,
         row_number() OVER (PARTITION BY deal_id, to_stage_id ORDER BY changed_at) AS rn
  FROM public.deal_stage_history
  WHERE event_type = 'stage_enter' AND to_stage_id IS NOT NULL
),
exits AS (
  SELECT deal_id, pipeline_id, from_stage_id AS stage_id, exited_at,
         row_number() OVER (PARTITION BY deal_id, from_stage_id ORDER BY exited_at) AS rn
  FROM public.deal_stage_history
  WHERE event_type = 'stage_exit' AND from_stage_id IS NOT NULL AND exited_at IS NOT NULL
)
SELECT
  e.deal_id,
  COALESCE(e.pipeline_id, x.pipeline_id) AS pipeline_id,
  e.stage_id,
  e.entered_at,
  x.exited_at,
  CASE WHEN x.exited_at IS NOT NULL THEN x.exited_at - e.entered_at END AS duration
FROM enters e
LEFT JOIN exits x
  ON x.deal_id = e.deal_id AND x.stage_id = e.stage_id AND x.rn = e.rn;

GRANT SELECT ON public.v_deal_stage_transitions TO authenticated, service_role;
