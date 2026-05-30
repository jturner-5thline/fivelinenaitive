
-- Add stage resolution columns to deal_stage_history
ALTER TABLE public.deal_stage_history
  ADD COLUMN IF NOT EXISTS to_stage_id text,
  ADD COLUMN IF NOT EXISTS to_stage_label_raw text,
  ADD COLUMN IF NOT EXISTS unresolved_stage_label text;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dsh_deal_to_stage_id_changed_at
  ON public.deal_stage_history (deal_id, to_stage_id, changed_at DESC);

-- Normalization helper
CREATE OR REPLACE FUNCTION public.normalize_stage_label(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(lower(coalesce(t,'')), '[^a-z0-9]', '', 'g')
$$;

-- Guardrail trigger
CREATE OR REPLACE FUNCTION public.validate_dsh_to_stage_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_company uuid;
  v_exists boolean;
BEGIN
  IF NEW.to_stage_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.pipeline_id IS NULL THEN
    RAISE EXCEPTION 'pipeline_id required when to_stage_id is set';
  END IF;
  SELECT company_id INTO v_company FROM public.deal_pipelines WHERE id = NEW.pipeline_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'pipeline % not found', NEW.pipeline_id;
  END IF;
  IF v_company = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid
     AND NEW.pipeline_id NOT IN (
       'b78ad452-b489-4c89-8a91-789347c05f79'::uuid,
       '40b17dfb-9122-49e0-bf7c-5aa993d5d615'::uuid
     ) THEN
    RAISE EXCEPTION 'For 5th Line, to_stage_id pipeline must be Active Deals or In Development';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.deal_pipelines p, jsonb_array_elements(p.stages) s
    WHERE p.id = NEW.pipeline_id AND s->>'id' = NEW.to_stage_id
  ) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'to_stage_id % not present in pipeline %', NEW.to_stage_id, NEW.pipeline_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_dsh_to_stage_id ON public.deal_stage_history;
CREATE TRIGGER trg_validate_dsh_to_stage_id
  BEFORE INSERT OR UPDATE OF to_stage_id, pipeline_id
  ON public.deal_stage_history
  FOR EACH ROW EXECUTE FUNCTION public.validate_dsh_to_stage_id();

-- Stage transitions view
CREATE OR REPLACE VIEW public.v_deal_stage_transitions AS
SELECT
  deal_id,
  pipeline_id,
  LAG(to_stage_id) OVER w AS from_stage_id,
  to_stage_id,
  changed_at AS entered_at,
  LEAD(changed_at) OVER w AS exited_at,
  (LEAD(changed_at) OVER w - changed_at) AS duration
FROM public.deal_stage_history
WHERE to_stage_id IS NOT NULL
WINDOW w AS (PARTITION BY deal_id ORDER BY changed_at);

GRANT SELECT ON public.v_deal_stage_transitions TO authenticated, service_role;
