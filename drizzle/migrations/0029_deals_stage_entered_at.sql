ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz DEFAULT now();

UPDATE public.deals d SET stage_entered_at = COALESCE(
  (SELECT max(h.changed_at) FROM public.deal_stage_history h WHERE h.deal_id = d.id AND h.to_stage = d.stage),
  d.created_at, now());

CREATE OR REPLACE FUNCTION public.deals_stamp_stage_entered_at()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_entered_at := COALESCE(NEW.stage_entered_at, now());
  ELSIF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_entered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_stamp_stage_entered_at ON public.deals;
CREATE TRIGGER trg_deals_stamp_stage_entered_at BEFORE INSERT OR UPDATE OF stage ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.deals_stamp_stage_entered_at();