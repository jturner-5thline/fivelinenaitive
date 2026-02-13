
-- Add account_id column for Unipile (replacing Nylas grant_id usage)
ALTER TABLE public.gmail_tokens ADD COLUMN IF NOT EXISTS account_id TEXT;

-- Copy existing grant_id values to account_id for any existing connections
-- (they'll need to reconnect anyway, but keeps schema clean)
UPDATE public.gmail_tokens SET account_id = grant_id WHERE grant_id IS NOT NULL AND account_id IS NULL;
