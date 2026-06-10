ALTER TABLE public.microsoft_tokens
  ADD COLUMN IF NOT EXISTS last_email_sync_cursor timestamptz,
  ADD COLUMN IF NOT EXISTS initial_backfill_done boolean NOT NULL DEFAULT false;