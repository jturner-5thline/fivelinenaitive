
-- Add provenance + lock columns to deal_emails so manual user links can never
-- be silently overwritten by AI auto-linkers. Existing rows are treated as
-- manual + locked (they were all created by explicit user clicks today).
ALTER TABLE public.deal_emails
  ADD COLUMN IF NOT EXISTS link_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT true;

ALTER TABLE public.deal_emails
  DROP CONSTRAINT IF EXISTS deal_emails_link_source_check;
ALTER TABLE public.deal_emails
  ADD CONSTRAINT deal_emails_link_source_check
  CHECK (link_source IN ('manual','ai_suggested','auto'));

-- Index to make hydration ("prefer manual/locked, latest first") cheap.
CREATE INDEX IF NOT EXISTS idx_deal_emails_msg_locked_linked_at
  ON public.deal_emails (gmail_message_id, locked DESC, linked_at DESC);

-- Belt-and-suspenders trigger: an INSERT/UPDATE coming from an AI source
-- (link_source <> 'manual', locked = false) is silently dropped when a
-- locked manual row already exists for that (user, gmail_message_id).
CREATE OR REPLACE FUNCTION public.tg_deal_emails_protect_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.link_source IS DISTINCT FROM 'manual' AND COALESCE(NEW.locked, false) = false THEN
    IF EXISTS (
      SELECT 1 FROM public.deal_emails de
      WHERE de.gmail_message_id = NEW.gmail_message_id
        AND de.user_id = NEW.user_id
        AND de.locked = true
        AND (TG_OP = 'INSERT' OR de.id <> NEW.id)
    ) THEN
      RETURN NULL; -- swallow the AI overwrite
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_emails_protect_locked ON public.deal_emails;
CREATE TRIGGER trg_deal_emails_protect_locked
BEFORE INSERT OR UPDATE ON public.deal_emails
FOR EACH ROW EXECUTE FUNCTION public.tg_deal_emails_protect_locked();
