ALTER TABLE public.email_cache
  ADD COLUMN IF NOT EXISTS body_html text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS inline_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gmail',
  ADD COLUMN IF NOT EXISTS body_fetched_at timestamptz;