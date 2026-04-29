-- Scheduled emails table for future delivery via Nylas
CREATE TABLE IF NOT EXISTS public.scheduled_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  thread_id text,
  reply_to_message_id text,
  to_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  body_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  nylas_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_user ON public.scheduled_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_pending_due
  ON public.scheduled_emails(scheduled_for)
  WHERE status = 'pending';

ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their scheduled emails"
ON public.scheduled_emails FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users create their scheduled emails"
ON public.scheduled_emails FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their scheduled emails"
ON public.scheduled_emails FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete their scheduled emails"
ON public.scheduled_emails FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_scheduled_emails_updated_at
BEFORE UPDATE ON public.scheduled_emails
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();