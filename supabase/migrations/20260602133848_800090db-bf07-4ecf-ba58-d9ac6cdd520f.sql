-- ============================================================
-- Agenda @mention → email pipeline (queue + trigger + preferences)
-- ============================================================

-- 1) User-level opt-in/out preferences for outbound mention emails.
CREATE TABLE IF NOT EXISTS public.user_email_preferences (
  user_id UUID PRIMARY KEY,
  agenda_mention_emails BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_email_preferences TO authenticated;
GRANT ALL ON public.user_email_preferences TO service_role;

ALTER TABLE public.user_email_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own email preferences"
  ON public.user_email_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own email preferences"
  ON public.user_email_preferences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own email preferences"
  ON public.user_email_preferences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2) Outbound mention-email job queue. Strictly server-managed.
CREATE TABLE IF NOT EXISTS public.pending_mention_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.agenda_comments(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped_optout', 'skipped_self', 'skipped_no_email')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pending_mention_emails_comment_recipient_uniq
  ON public.pending_mention_emails(comment_id, recipient_user_id);
CREATE INDEX IF NOT EXISTS pending_mention_emails_status_idx
  ON public.pending_mention_emails(status, created_at);

GRANT ALL ON public.pending_mention_emails TO service_role;
-- No anon/authenticated grants: only the edge function (service_role) reads/writes this queue.

ALTER TABLE public.pending_mention_emails ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anon → effectively service-role only.

-- 3) Trigger: when an agenda_comment is inserted, enqueue one row per mention
--    (excluding self-mentions). Idempotent via the UNIQUE INDEX above.
CREATE OR REPLACE FUNCTION public.enqueue_agenda_mention_emails()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient UUID;
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  FOREACH recipient IN ARRAY NEW.mentions LOOP
    -- Anti-spam: skip self-mentions.
    IF recipient = NEW.author_id THEN
      CONTINUE;
    END IF;

    INSERT INTO public.pending_mention_emails (comment_id, recipient_user_id, status)
    VALUES (NEW.id, recipient, 'pending')
    ON CONFLICT (comment_id, recipient_user_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agenda_comments_enqueue_mention_emails ON public.agenda_comments;
CREATE TRIGGER trg_agenda_comments_enqueue_mention_emails
  AFTER INSERT ON public.agenda_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_agenda_mention_emails();

-- 4) updated_at trigger for the queue.
CREATE OR REPLACE FUNCTION public.touch_pending_mention_emails_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pending_mention_emails_touch ON public.pending_mention_emails;
CREATE TRIGGER trg_pending_mention_emails_touch
  BEFORE UPDATE ON public.pending_mention_emails
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_pending_mention_emails_updated_at();
