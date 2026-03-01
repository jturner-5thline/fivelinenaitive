-- Add company_name to quickbooks_tokens so users can identify which QB company each connection is for
ALTER TABLE public.quickbooks_tokens ADD COLUMN IF NOT EXISTS company_name text;

-- Fetch company info from QB API on connect, store it here for display purposes
