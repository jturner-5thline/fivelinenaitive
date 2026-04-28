
-- 1. Insert the global notification rule for email priority signals.
INSERT INTO public.notification_rules (
  name,
  description,
  trigger_key,
  category,
  is_enabled,
  channels,
  default_recipients,
  metadata,
  company_id
)
VALUES (
  'Email Priority Signal',
  'Fires when an inbound email contains a high-priority deal signal (e.g. due diligence, term sheet, pass, wire, signed).',
  'email_priority_signal',
  'deals',
  true,
  '[
    {
      "channel_type": "in_app",
      "is_enabled": true,
      "template": {
        "title": "{{lender_name}} → {{deal_name}}: {{signal_label}}",
        "body": "{{quote}}"
      }
    },
    {
      "channel_type": "slack",
      "is_enabled": true,
      "template": {
        "title": "{{lender_name}} → {{deal_name}}: {{signal_label}}",
        "body": "{{lender_name}} replied re: {{deal_name}} — signal: {{signal_label}}.\nOpen in naitive: {{deal_url}}"
      }
    }
  ]'::jsonb,
  '{ "scope": "deal_owner_and_manager" }'::jsonb,
  '{
    "default_signal_types": [
      "due_diligence",
      "term_sheet",
      "pass",
      "decline",
      "not_a_fit",
      "wire",
      "close",
      "funded",
      "agreement",
      "signed",
      "committed"
    ]
  }'::jsonb,
  NULL
)
ON CONFLICT (trigger_key) DO NOTHING;

-- 2. Append-only log to dedupe (message_id, signal_type) pairs across all
--    sessions / clients so each priority signal fires the notification at
--    most once.
CREATE TABLE IF NOT EXISTS public.email_priority_signal_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   text NOT NULL,
  signal_type  text NOT NULL,
  deal_id      uuid,
  lender_name  text,
  detected_at  timestamp with time zone NOT NULL DEFAULT now(),
  detected_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (message_id, signal_type)
);

CREATE INDEX IF NOT EXISTS idx_email_priority_signal_log_detected_at
  ON public.email_priority_signal_log (detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_priority_signal_log_deal
  ON public.email_priority_signal_log (deal_id, detected_at DESC);

ALTER TABLE public.email_priority_signal_log ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read the log (used to render flag icons in
-- the inbox list view) and to perform the dedupe check before invoking
-- the notification engine.
CREATE POLICY "Authenticated users can view priority signal log"
  ON public.email_priority_signal_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert (the client claims the signal first; if
-- the unique constraint blocks the insert, no notification is sent).
CREATE POLICY "Authenticated users can record priority signals"
  ON public.email_priority_signal_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
