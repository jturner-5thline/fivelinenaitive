-- 1) Trigger function: log every stage change to activity_logs
CREATE OR REPLACE FUNCTION public.log_deal_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.stage IS DISTINCT FROM OLD.stage
     AND NEW.stage IS NOT NULL THEN
    INSERT INTO public.activity_logs (
      deal_id, user_id, activity_type, description, metadata, created_at
    ) VALUES (
      NEW.id,
      auth.uid(),
      'stage_change',
      'Stage changed from ' || COALESCE(OLD.stage, '—') || ' to ' || NEW.stage,
      jsonb_build_object('from', OLD.stage, 'to', NEW.stage),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deals_log_stage_change ON public.deals;
CREATE TRIGGER deals_log_stage_change
AFTER UPDATE OF stage ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.log_deal_stage_change();

-- 2) Backfill: for any deal currently in a "signed" stage with no stage_change
--    entry recording its arrival, insert one using the deal's updated_at.
INSERT INTO public.activity_logs (deal_id, user_id, activity_type, description, metadata, created_at)
SELECT
  d.id,
  NULL,
  'stage_change',
  'Stage entry backfilled to ' || d.stage,
  jsonb_build_object('from', NULL, 'to', d.stage, 'backfilled', true),
  d.updated_at
FROM public.deals d
WHERE d.stage IN ('final-credit-items', 'fs-active-client')
  AND NOT EXISTS (
    SELECT 1
    FROM public.activity_logs al
    WHERE al.deal_id = d.id
      AND al.activity_type = 'stage_change'
      AND al.metadata->>'to' = d.stage
  );