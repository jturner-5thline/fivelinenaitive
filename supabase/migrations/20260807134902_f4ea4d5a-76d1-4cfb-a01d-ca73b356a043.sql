ALTER TABLE public.claap_recording_links ADD COLUMN IF NOT EXISTS unlink_reason text;

CREATE TABLE IF NOT EXISTS public.claap_recording_link_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid REFERENCES public.claap_recording_links(id) ON DELETE CASCADE,
  recording_id uuid NOT NULL,
  entity_type text,
  entity_id uuid,
  link_role text,
  event_type text NOT NULL,
  source text,
  confidence numeric,
  reason text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_claap_link_events_recording ON public.claap_recording_link_events(recording_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claap_link_events_entity ON public.claap_recording_link_events(entity_id, created_at DESC);

GRANT SELECT ON public.claap_recording_link_events TO authenticated;
GRANT ALL ON public.claap_recording_link_events TO service_role;

ALTER TABLE public.claap_recording_link_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view link history"
ON public.claap_recording_link_events FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.log_claap_recording_link_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.source = 'manual' THEN
      v_event := 'manual_linked';
    ELSE
      v_event := 'auto_matched';
    END IF;
  ELSE
    IF NEW.review_status IS DISTINCT FROM OLD.review_status THEN
      IF NEW.review_status = 'rejected' THEN
        v_event := 'unlinked';
      ELSIF NEW.review_status = 'confirmed' AND OLD.review_status = 'rejected' THEN
        v_event := 'relinked';
      ELSIF NEW.review_status = 'confirmed' THEN
        v_event := 'confirmed';
      ELSE
        v_event := 'status_changed';
      END IF;
    ELSIF NEW.source IS DISTINCT FROM OLD.source AND NEW.source = 'manual' THEN
      v_event := 'manual_linked';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.claap_recording_link_events (
    link_id, recording_id, entity_type, entity_id, link_role,
    event_type, source, confidence, reason, actor_id
  ) VALUES (
    NEW.id, NEW.recording_id, NEW.entity_type, NEW.entity_id, NEW.link_role,
    v_event, NEW.source, NEW.confidence,
    CASE WHEN v_event = 'unlinked' THEN NEW.unlink_reason ELSE NULL END,
    COALESCE(NEW.reviewed_by, NEW.created_by, v_actor)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_claap_recording_link_event ON public.claap_recording_links;
CREATE TRIGGER trg_log_claap_recording_link_event
AFTER INSERT OR UPDATE ON public.claap_recording_links
FOR EACH ROW EXECUTE FUNCTION public.log_claap_recording_link_event();