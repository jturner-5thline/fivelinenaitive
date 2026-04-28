-- ─────────────────────────────────────────────────────────────
-- email_threads — per-thread classification + manual override
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id text NOT NULL,
  matched_deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  match_confidence numeric(4,3) NOT NULL DEFAULT 0,
  match_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_override_clients_deals boolean,
  is_clients_deals boolean NOT NULL DEFAULT false,
  last_classified_at timestamptz,
  needs_reclassify boolean NOT NULL DEFAULT true,
  -- denormalised metadata to support fast UI lookups + sweep candidate selection
  subject text,
  latest_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, thread_id),
  CHECK (match_confidence >= 0 AND match_confidence <= 1)
);

CREATE INDEX IF NOT EXISTS idx_email_threads_user_dirty
  ON public.email_threads (user_id) WHERE needs_reclassify;
CREATE INDEX IF NOT EXISTS idx_email_threads_user_clients_deals
  ON public.email_threads (user_id) WHERE is_clients_deals;
CREATE INDEX IF NOT EXISTS idx_email_threads_matched_deal
  ON public.email_threads (matched_deal_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_user_thread
  ON public.email_threads (user_id, thread_id);

-- updated_at trigger (reuses the project-standard helper)
DROP TRIGGER IF EXISTS trg_email_threads_updated_at ON public.email_threads;
CREATE TRIGGER trg_email_threads_updated_at
BEFORE UPDATE ON public.email_threads
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS — owner only
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can view own thread classifications" ON public.email_threads;
CREATE POLICY "Owner can view own thread classifications"
  ON public.email_threads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Owner can insert own thread classifications" ON public.email_threads;
CREATE POLICY "Owner can insert own thread classifications"
  ON public.email_threads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owner can update own thread classifications" ON public.email_threads;
CREATE POLICY "Owner can update own thread classifications"
  ON public.email_threads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owner can delete own thread classifications" ON public.email_threads;
CREATE POLICY "Owner can delete own thread classifications"
  ON public.email_threads
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- Helper: mark a (user_id, thread_id) row dirty, inserting a
-- skeleton row if necessary. Idempotent.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_email_thread_dirty(
  _user_id uuid,
  _thread_id text,
  _subject text DEFAULT NULL,
  _latest_message_at timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _thread_id IS NULL OR _thread_id = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.email_threads (user_id, thread_id, subject, latest_message_at, needs_reclassify)
  VALUES (_user_id, _thread_id, _subject, _latest_message_at, true)
  ON CONFLICT (user_id, thread_id) DO UPDATE
    SET needs_reclassify = true,
        subject = COALESCE(EXCLUDED.subject, public.email_threads.subject),
        latest_message_at = GREATEST(
          public.email_threads.latest_message_at,
          EXCLUDED.latest_message_at
        ),
        updated_at = now();
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Trigger: when a new message lands in email_cache, mark its
-- thread dirty for re-classification.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_email_cache_mark_thread_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.thread_id IS NOT NULL AND NEW.thread_id <> '' THEN
    PERFORM public.mark_email_thread_dirty(
      NEW.user_id, NEW.thread_id, NEW.subject, NEW.received_at
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_cache_classify ON public.email_cache;
CREATE TRIGGER trg_email_cache_classify
AFTER INSERT OR UPDATE OF thread_id, subject, received_at ON public.email_cache
FOR EACH ROW EXECUTE FUNCTION public.tg_email_cache_mark_thread_dirty();

-- ─────────────────────────────────────────────────────────────
-- Trigger: when a deal is renamed, archived, or otherwise has a
-- field that affects matching changed, mark every thread that
-- could possibly match dirty so the next sweep re-evaluates.
-- We keep this simple: any thread already matched to this deal,
-- plus a domain-based fan-out is handled by the classifier itself
-- on its next pass (it always re-checks all candidates).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_deals_invalidate_thread_classifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark threads currently matched to this deal as dirty. This handles
  -- archive (drop) and rename/alias change (re-evaluate).
  UPDATE public.email_threads
  SET needs_reclassify = true,
      updated_at = now()
  WHERE matched_deal_id = COALESCE(NEW.id, OLD.id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_invalidate_classifications ON public.deals;
CREATE TRIGGER trg_deals_invalidate_classifications
AFTER UPDATE OF company, status, pipeline_id, company_url ON public.deals
FOR EACH ROW
WHEN (
  OLD.company IS DISTINCT FROM NEW.company
  OR OLD.status IS DISTINCT FROM NEW.status
  OR OLD.pipeline_id IS DISTINCT FROM NEW.pipeline_id
  OR OLD.company_url IS DISTINCT FROM NEW.company_url
)
EXECUTE FUNCTION public.tg_deals_invalidate_thread_classifications();

DROP TRIGGER IF EXISTS trg_deals_delete_invalidate_classifications ON public.deals;
CREATE TRIGGER trg_deals_delete_invalidate_classifications
AFTER DELETE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.tg_deals_invalidate_thread_classifications();

-- Alias changes also invalidate.
CREATE OR REPLACE FUNCTION public.tg_deal_aliases_invalidate_classifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deal_id uuid;
BEGIN
  _deal_id := COALESCE(NEW.deal_id, OLD.deal_id);
  UPDATE public.email_threads
  SET needs_reclassify = true, updated_at = now()
  WHERE matched_deal_id = _deal_id;
  -- Also flag any thread that mentions the alias in its subject so it can
  -- newly qualify. Cheap LIKE since aliases are short.
  IF TG_OP <> 'DELETE' THEN
    UPDATE public.email_threads et
    SET needs_reclassify = true, updated_at = now()
    WHERE et.subject IS NOT NULL
      AND lower(et.subject) LIKE '%' || NEW.alias_normalized || '%';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_aliases_invalidate ON public.deal_aliases;
CREATE TRIGGER trg_deal_aliases_invalidate
AFTER INSERT OR DELETE OR UPDATE OF alias_normalized ON public.deal_aliases
FOR EACH ROW EXECUTE FUNCTION public.tg_deal_aliases_invalidate_classifications();

-- ─────────────────────────────────────────────────────────────
-- When a user manually links/unlinks an email to a deal via
-- deal_emails, mark the affected thread dirty so the explicit
-- linked_deal_id signal is picked up immediately.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_deal_emails_mark_thread_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _thread_id text;
BEGIN
  _user_id := COALESCE(NEW.user_id, OLD.user_id);
  -- Look the thread up via the linked gmail_message_id.
  SELECT ec.thread_id INTO _thread_id
  FROM public.email_cache ec
  WHERE ec.user_id = _user_id
    AND ec.gmail_message_id = COALESCE(NEW.gmail_message_id, OLD.gmail_message_id)
  LIMIT 1;

  IF _thread_id IS NOT NULL THEN
    PERFORM public.mark_email_thread_dirty(_user_id, _thread_id, NULL, NULL);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_emails_classify ON public.deal_emails;
CREATE TRIGGER trg_deal_emails_classify
AFTER INSERT OR DELETE ON public.deal_emails
FOR EACH ROW EXECUTE FUNCTION public.tg_deal_emails_mark_thread_dirty();