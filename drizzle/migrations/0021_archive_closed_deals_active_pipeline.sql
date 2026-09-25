CREATE OR REPLACE FUNCTION public.deals_force_archived_when_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stage IN ('closed-won', 'closed-lost')
     AND NEW.pipeline_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.deal_pipelines p WHERE p.id = NEW.pipeline_id AND p.is_default = true)
     AND NEW.status IS DISTINCT FROM 'archived' THEN
    NEW.status := 'archived';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_force_archived_when_closed ON public.deals;
CREATE TRIGGER trg_deals_force_archived_when_closed
BEFORE INSERT OR UPDATE OF stage, status, pipeline_id ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.deals_force_archived_when_closed();