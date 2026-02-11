
-- Add Nylas-specific columns to gmail_tokens table
ALTER TABLE public.gmail_tokens
  ADD COLUMN IF NOT EXISTS grant_id text,
  ADD COLUMN IF NOT EXISTS email_address text;

-- Make access_token and refresh_token nullable (Nylas manages tokens, we just store grant_id)
ALTER TABLE public.gmail_tokens
  ALTER COLUMN access_token DROP NOT NULL,
  ALTER COLUMN refresh_token DROP NOT NULL,
  ALTER COLUMN expires_at DROP NOT NULL;
