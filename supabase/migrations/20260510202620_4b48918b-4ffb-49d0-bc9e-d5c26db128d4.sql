
ALTER TABLE public.microsoft_tokens
  ADD COLUMN IF NOT EXISTS scopes text,
  ADD COLUMN IF NOT EXISTS sync_email_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sync_calendar_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_email_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_calendar_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'connected';

CREATE TABLE IF NOT EXISTS public.ms_synced_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  thread_id text,
  provider text NOT NULL DEFAULT 'microsoft',
  subject text,
  from_email text,
  from_name text,
  to_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  body_preview text,
  received_at timestamptz,
  is_read boolean NOT NULL DEFAULT false,
  has_attachments boolean NOT NULL DEFAULT false,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_ms_synced_emails_user_received ON public.ms_synced_emails (user_id, received_at DESC);

ALTER TABLE public.ms_synced_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ms emails" ON public.ms_synced_emails
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role manages ms emails" ON public.ms_synced_emails
  TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_ms_synced_emails_updated_at BEFORE UPDATE ON public.ms_synced_emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.ms_synced_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  provider text NOT NULL DEFAULT 'microsoft',
  title text,
  start_time timestamptz,
  end_time timestamptz,
  location text,
  organizer jsonb,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  body_preview text,
  is_all_day boolean NOT NULL DEFAULT false,
  is_cancelled boolean NOT NULL DEFAULT false,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_ms_synced_cal_user_start ON public.ms_synced_calendar_events (user_id, start_time);

ALTER TABLE public.ms_synced_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ms calendar" ON public.ms_synced_calendar_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role manages ms calendar" ON public.ms_synced_calendar_events
  TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_ms_synced_cal_updated_at BEFORE UPDATE ON public.ms_synced_calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
