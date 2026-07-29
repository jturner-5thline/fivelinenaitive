
CREATE TABLE public.claude_response_cache (
  signature TEXT PRIMARY KEY,
  company_id UUID,
  user_id UUID NOT NULL,
  mode TEXT NOT NULL,
  deal_id UUID,
  response TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  hit_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX claude_response_cache_expires_idx ON public.claude_response_cache(expires_at);
CREATE INDEX claude_response_cache_company_idx ON public.claude_response_cache(company_id, mode);

GRANT ALL ON public.claude_response_cache TO service_role;

ALTER TABLE public.claude_response_cache ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated — only service_role (via edge function) touches this table.
