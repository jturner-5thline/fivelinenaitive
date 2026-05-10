
CREATE TABLE IF NOT EXISTS public.emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  message_id text NOT NULL,
  thread_id text,
  subject text,
  from_email text,
  from_name text,
  to_emails text[] NOT NULL DEFAULT '{}',
  preview text,
  received_at timestamptz,
  is_read boolean NOT NULL DEFAULT false,
  has_attachments boolean NOT NULL DEFAULT false,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, message_id)
);

CREATE INDEX IF NOT EXISTS idx_emails_user_received ON public.emails (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_user_provider ON public.emails (user_id, provider);

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own emails" ON public.emails
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages emails" ON public.emails
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_emails_updated_at
  BEFORE UPDATE ON public.emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_id text NOT NULL,
  title text,
  start_time timestamptz,
  end_time timestamptz,
  organizer_email text,
  attendees text[] NOT NULL DEFAULT '{}',
  location text,
  meeting_url text,
  is_all_day boolean NOT NULL DEFAULT false,
  is_cancelled boolean NOT NULL DEFAULT false,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_start ON public.calendar_events (user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_provider ON public.calendar_events (user_id, provider);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own calendar events" ON public.calendar_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages calendar events" ON public.calendar_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
