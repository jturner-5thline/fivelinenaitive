-- 1. Denormalized mention list on task_comments (spec'd for fast render)
ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS mentions uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_task_comments_mentions
  ON public.task_comments USING GIN (mentions);

-- 2. BEFORE trigger: parse @[Name](uuid) tokens out of body and store array
CREATE OR REPLACE FUNCTION public.task_comments_populate_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT (m[2])::uuid), '{}'::uuid[])
    INTO ids
  FROM regexp_matches(COALESCE(NEW.body, ''),
                      '@\[[^\]]+\]\(([0-9a-fA-F-]{36})\)', 'g') AS m;
  NEW.mentions := ids;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_comments_populate_mentions ON public.task_comments;
CREATE TRIGGER trg_task_comments_populate_mentions
  BEFORE INSERT OR UPDATE OF body ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.task_comments_populate_mentions();

-- 3. AFTER trigger: fan out into normalized task_mentions for the
--    "mentions of me" feed (idempotent, ignores self-mentions)
CREATE OR REPLACE FUNCTION public.task_comments_fanout_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  FOREACH uid IN ARRAY NEW.mentions LOOP
    IF uid <> NEW.author_id THEN
      INSERT INTO public.task_mentions
        (task_id, comment_id, mentioned_by, mentioned_user_id, source)
      VALUES (NEW.task_id, NEW.id, NEW.author_id, uid, 'comment')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_comments_fanout_mentions ON public.task_comments;
CREATE TRIGGER trg_task_comments_fanout_mentions
  AFTER INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.task_comments_fanout_mentions();

-- 4. notification_log — records every outbound notification (idempotency + audit)
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,                  -- e.g. 'task_mention'
  ref_id uuid NOT NULL,                -- e.g. task_comments.id
  user_id uuid NOT NULL,               -- recipient
  channel text NOT NULL DEFAULT 'email',
  status text NOT NULL DEFAULT 'sent', -- 'sent' | 'failed' | 'skipped'
  provider_message_id text,
  payload jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_unique
  ON public.notification_log (kind, ref_id, user_id, channel);

CREATE INDEX IF NOT EXISTS idx_notification_log_user
  ON public.notification_log (user_id, created_at DESC);

GRANT SELECT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON public.notification_log
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
