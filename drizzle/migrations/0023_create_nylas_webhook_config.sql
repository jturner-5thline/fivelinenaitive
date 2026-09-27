CREATE TABLE IF NOT EXISTS public.nylas_webhook_config (
  id text PRIMARY KEY DEFAULT 'default',
  webhook_id text,
  webhook_secret text,
  callback_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.nylas_webhook_config TO service_role;
ALTER TABLE public.nylas_webhook_config ENABLE ROW LEVEL SECURITY;