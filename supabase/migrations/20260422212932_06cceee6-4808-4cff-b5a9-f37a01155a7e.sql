-- 1) Per-user stale alert thresholds
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stale_deal_threshold_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS stale_lender_threshold_days integer NOT NULL DEFAULT 5;

-- 2) Seed / upsert notification rules for the three new triggers.
-- We use category 'deals' (existing enum value) and the standard channels shape.
INSERT INTO public.notification_rules
  (trigger_key, name, description, category, is_enabled, channels, default_recipients, metadata)
VALUES
  (
    'stale_deal_alert',
    'Stale Deal Alert',
    'Sent when a deal has had no status update or lender activity for the configured threshold (default 7 days). Re-fires only when a new threshold boundary is crossed (e.g. 7d, 14d, 21d).',
    'deals',
    true,
    '[
      {"channel_type":"in_app","is_enabled":true,"template":{"title":"{{deal_company}} hasn''t been touched in {{days_since}} days","body":"{{deal_company}} hasn''t had any updates or lender activity in {{days_since}} days. Take a look to keep things moving."}},
      {"channel_type":"email","is_enabled":true,"template":{"subject":"naitive: {{deal_company}} is stale ({{days_since}}d)","title":"Stale deal: {{deal_company}}","body":"Hi {{recipient_name}},\n\n{{deal_company}} hasn''t been updated in {{days_since}} days. Visit the deal to add an update or follow up with lenders."}}
    ]'::jsonb,
    '{"roles":["DEAL_OWNER","DEAL_MANAGER"]}'::jsonb,
    '{"dedup":"threshold_boundary","boundaries":[7,14,21,28]}'::jsonb
  ),
  (
    'lender_access_request',
    'Lender Access Request',
    'Sent immediately when a lender requests access to a deal. Both deal owner and deal manager are notified via email and in-platform.',
    'lenders',
    true,
    '[
      {"channel_type":"in_app","is_enabled":true,"template":{"title":"{{requester_name}} requested access to {{deal_company}}","body":"{{requester_name}} ({{requester_email}}) has requested access to {{deal_company}}."}},
      {"channel_type":"email","is_enabled":true,"template":{"subject":"naitive: {{requester_name}} requested access to {{deal_company}}","title":"Access requested","body":"Hi {{recipient_name}},\n\n{{requester_name}} ({{requester_email}}) has requested access to {{deal_company}} on {{requested_at}}.\n\nReview the request: {{deal_url}}"}}
    ]'::jsonb,
    '{"roles":["DEAL_OWNER","DEAL_MANAGER"]}'::jsonb,
    '{"include_link":true}'::jsonb
  )
ON CONFLICT (trigger_key) DO UPDATE
SET
  is_enabled = true,
  channels = EXCLUDED.channels,
  default_recipients = EXCLUDED.default_recipients,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- 3) Normalize the existing stale_lender_alert rule so both channels are on by default.
UPDATE public.notification_rules
SET
  is_enabled = true,
  channels = '[
    {"channel_type":"in_app","is_enabled":true,"template":{"title":"{{lender_name}} on {{deal_company}} is stale","body":"{{lender_name}} hasn''t responded in {{days_since}} days on {{deal_company}}. Consider a follow-up."}},
    {"channel_type":"email","is_enabled":true,"template":{"subject":"naitive: {{lender_name}} is stale on {{deal_company}}","title":"Stale lender","body":"Hi {{recipient_name}},\n\n{{lender_name}} on {{deal_company}} hasn''t progressed in {{days_since}} days."}}
  ]'::jsonb,
  default_recipients = '{"roles":["DEAL_OWNER","DEAL_MANAGER"]}'::jsonb,
  metadata = COALESCE(metadata, '{}'::jsonb) || '{"dedup":"threshold_boundary","boundaries":[5,10,15,20,25]}'::jsonb,
  updated_at = now()
WHERE trigger_key = 'stale_lender_alert';
