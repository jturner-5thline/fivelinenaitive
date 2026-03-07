CREATE TABLE public.microsoft_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  email TEXT,
  display_name TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.microsoft_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own microsoft tokens"
  ON public.microsoft_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage microsoft tokens"
  ON public.microsoft_tokens FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);