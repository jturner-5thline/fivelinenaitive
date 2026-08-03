ALTER TABLE public.claap_api_usage
  ADD COLUMN IF NOT EXISTS alert_80_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS alert_429_sent_at timestamptz;