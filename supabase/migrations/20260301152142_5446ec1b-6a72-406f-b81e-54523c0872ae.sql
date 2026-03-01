-- Create oauth_states table for CSRF protection during QuickBooks OAuth
CREATE TABLE IF NOT EXISTS public.quickbooks_oauth_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  state TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '10 minutes')
);

-- Enable RLS
ALTER TABLE public.quickbooks_oauth_states ENABLE ROW LEVEL SECURITY;

-- Only service_role can access (edge function uses service role)
-- No public policies needed since this is only accessed from edge functions
