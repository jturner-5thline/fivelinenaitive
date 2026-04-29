-- 1. Table
CREATE TABLE IF NOT EXISTS public.deal_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id uuid,
  pipeline_id uuid,
  from_stage text,
  to_stage text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);

CREATE INDEX IF NOT EXISTS idx_dsh_company_pipeline_stage_time
  ON public.deal_stage_history (company_id, pipeline_id, to_stage, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_dsh_deal_time
  ON public.deal_stage_history (deal_id, changed_at DESC);

-- 2. RLS
ALTER TABLE public.deal_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their company's stage history"
  ON public.deal_stage_history
  FOR SELECT
  TO authenticated
  USING (company_id = ANY (public.get_user_company_ids(auth.uid())));

-- No INSERT/UPDATE/DELETE policies for users — handled by SECURITY DEFINER trigger only.

-- 3. Trigger function
CREATE OR REPLACE FUNCTION public.record_deal_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage IS NOT NULL THEN
      INSERT INTO public.deal_stage_history
        (deal_id, company_id, pipeline_id, from_stage, to_stage, changed_at, changed_by)
      VALUES
        (NEW.id, NEW.company_id, NEW.pipeline_id, NULL, NEW.stage, COALESCE(NEW.created_at, now()), NEW.user_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.stage IS DISTINCT FROM OLD.stage THEN
      INSERT INTO public.deal_stage_history
        (deal_id, company_id, pipeline_id, from_stage, to_stage, changed_at, changed_by)
      VALUES
        (NEW.id, NEW.company_id, NEW.pipeline_id, OLD.stage, NEW.stage, now(), auth.uid());
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_deal_stage_change ON public.deals;
CREATE TRIGGER trg_record_deal_stage_change
  AFTER INSERT OR UPDATE OF stage ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.record_deal_stage_change();

-- 4. Backfill: one synthetic row per existing deal at its current stage (idempotent).
INSERT INTO public.deal_stage_history
  (deal_id, company_id, pipeline_id, from_stage, to_stage, changed_at, changed_by)
SELECT
  d.id,
  d.company_id,
  d.pipeline_id,
  NULL,
  d.stage,
  COALESCE(d.updated_at, d.created_at, now()),
  d.user_id
FROM public.deals d
WHERE d.stage IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.deal_stage_history h WHERE h.deal_id = d.id
  );