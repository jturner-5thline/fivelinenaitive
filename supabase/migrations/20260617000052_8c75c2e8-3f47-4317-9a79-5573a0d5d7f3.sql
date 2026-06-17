
ALTER TABLE public.gmail_messages
  ADD COLUMN IF NOT EXISTS is_demo_seed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seed_key text;

CREATE UNIQUE INDEX IF NOT EXISTS gmail_messages_user_seed_key_uidx
  ON public.gmail_messages (user_id, seed_key)
  WHERE seed_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS gmail_messages_is_demo_seed_idx
  ON public.gmail_messages (user_id)
  WHERE is_demo_seed = true;

ALTER TABLE public.email_threads
  ADD COLUMN IF NOT EXISTS is_demo_seed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seed_key text;

CREATE UNIQUE INDEX IF NOT EXISTS email_threads_user_seed_key_uidx
  ON public.email_threads (user_id, seed_key)
  WHERE seed_key IS NOT NULL;

ALTER TABLE public.gmail_tokens
  ADD COLUMN IF NOT EXISTS is_demo_seed boolean NOT NULL DEFAULT false;
