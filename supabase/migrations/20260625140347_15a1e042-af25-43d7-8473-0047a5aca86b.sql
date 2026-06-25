
-- 1. Extend deal_flag_notes with source tracking
ALTER TABLE public.deal_flag_notes
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_ref uuid,
  ADD COLUMN IF NOT EXISTS source_created_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS deal_flag_notes_source_unique
  ON public.deal_flag_notes (source, source_ref)
  WHERE source IS NOT NULL AND source_ref IS NOT NULL;

-- 2. Trigger function: notification insert -> flag note + is_flagged
CREATE OR REPLACE FUNCTION public.flex_notification_to_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_note text;
BEGIN
  v_note := COALESCE(NEW.message, 'Flex notification');
  IF NEW.lender_name IS NOT NULL AND length(NEW.lender_name) > 0 THEN
    v_note := v_note || E'\n\nLender: ' || NEW.lender_name;
  END IF;
  IF NEW.company_name IS NOT NULL AND length(NEW.company_name) > 0 THEN
    v_note := v_note || E'\nCompany: ' || NEW.company_name;
  END IF;
  IF NEW.user_email IS NOT NULL AND length(NEW.user_email) > 0 THEN
    v_note := v_note || E'\nFrom: ' || NEW.user_email;
  END IF;

  INSERT INTO public.deal_flag_notes (deal_id, note, source, source_ref, source_created_at, created_at)
  VALUES (NEW.deal_id, v_note, 'flex_notification', NEW.id, NEW.created_at, NEW.created_at)
  ON CONFLICT (source, source_ref) WHERE source IS NOT NULL AND source_ref IS NOT NULL DO NOTHING;

  UPDATE public.deals SET is_flagged = true WHERE id = NEW.deal_id AND COALESCE(is_flagged, false) = false;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flex_notification_to_flag ON public.flex_info_notifications;
CREATE TRIGGER trg_flex_notification_to_flag
  AFTER INSERT ON public.flex_info_notifications
  FOR EACH ROW EXECUTE FUNCTION public.flex_notification_to_flag();

-- 3. Trigger function: notification dismissed -> resolve matching flag note
CREATE OR REPLACE FUNCTION public.flex_notification_resolve_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('dismissed', 'resolved', 'archived') AND
     COALESCE(OLD.status, '') NOT IN ('dismissed', 'resolved', 'archived') THEN
    UPDATE public.deal_flag_notes
       SET resolved = true,
           resolved_at = now()
     WHERE source = 'flex_notification'
       AND source_ref = NEW.id
       AND resolved = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flex_notification_resolve_flag ON public.flex_info_notifications;
CREATE TRIGGER trg_flex_notification_resolve_flag
  AFTER UPDATE OF status ON public.flex_info_notifications
  FOR EACH ROW EXECUTE FUNCTION public.flex_notification_resolve_flag();

-- 4. Backfill: existing pending/read notifications -> flag notes + is_flagged
INSERT INTO public.deal_flag_notes (deal_id, note, source, source_ref, source_created_at, created_at)
SELECT
  n.deal_id,
  COALESCE(n.message, 'Flex notification')
    || CASE WHEN n.lender_name IS NOT NULL AND length(n.lender_name) > 0 THEN E'\n\nLender: ' || n.lender_name ELSE '' END
    || CASE WHEN n.company_name IS NOT NULL AND length(n.company_name) > 0 THEN E'\nCompany: ' || n.company_name ELSE '' END
    || CASE WHEN n.user_email IS NOT NULL AND length(n.user_email) > 0 THEN E'\nFrom: ' || n.user_email ELSE '' END,
  'flex_notification',
  n.id,
  n.created_at,
  n.created_at
FROM public.flex_info_notifications n
WHERE n.status IN ('pending', 'read')
ON CONFLICT (source, source_ref) WHERE source IS NOT NULL AND source_ref IS NOT NULL DO NOTHING;

UPDATE public.deals d
   SET is_flagged = true
  FROM public.flex_info_notifications n
 WHERE n.deal_id = d.id
   AND n.status IN ('pending', 'read')
   AND COALESCE(d.is_flagged, false) = false;
