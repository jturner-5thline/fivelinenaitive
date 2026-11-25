CREATE TABLE public.active_deal_update_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL,
  company_id uuid NOT NULL,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
GRANT ALL ON public.active_deal_update_queue TO service_role;
ALTER TABLE public.active_deal_update_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages active deal update queue" ON public.active_deal_update_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_active_deal_update_queue_pending ON public.active_deal_update_queue(created_at) WHERE sent_at IS NULL;

CREATE OR REPLACE FUNCTION public.enqueue_active_deal_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_active boolean;
BEGIN
  IF NEW.company_id IS DISTINCT FROM '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid THEN RETURN NEW; END IF;
  IF NEW.company IN ('Test-Niki''s Store', 'Example Deal') OR lower(NEW.company) LIKE 'test %' THEN RETURN NEW; END IF;
  SELECT CASE WHEN NEW.pipeline_id IS NULL THEN true ELSE COALESCE(p.is_default, false) END INTO v_active
    FROM (SELECT 1) x LEFT JOIN public.deal_pipelines p ON p.id = NEW.pipeline_id;
  IF NOT v_active THEN RETURN NEW; END IF;
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    v_changes := v_changes || jsonb_build_object('stage', jsonb_build_object('from', OLD.stage, 'to', NEW.stage));
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN
    v_changes := v_changes || jsonb_build_object('notes', jsonb_build_object('from', OLD.notes, 'to', NEW.notes));
  END IF;
  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.active_deal_update_queue (deal_id, company_id, changes, changed_by)
    VALUES (NEW.id, NEW.company_id, v_changes, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enqueue_active_deal_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_enqueue_active_deal_update
AFTER UPDATE OF stage, status, notes ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.enqueue_active_deal_update();