-- Update the global "Deal Flagged" notification rule:
-- Recipients are now Deal Owner + Deal Manager + Admins of the deal's company.
-- Template body includes optional flag note when present.
UPDATE public.notification_rules
SET
  default_recipients = jsonb_build_object(
    'roles', jsonb_build_array('DEAL_OWNER', 'DEAL_MANAGER', 'ADMIN'),
    'scope', 'company',
    'user_ids', '[]'::jsonb
  ),
  channels = jsonb_build_array(
    jsonb_build_object(
      'channel_type', 'in_app',
      'is_enabled', true,
      'template', jsonb_build_object(
        'title', '{{actor_name}} flagged {{deal_name}}',
        'body', '{{actor_name}} flagged {{deal_name}}{{flag_note_suffix}}'
      )
    ),
    jsonb_build_object(
      'channel_type', 'email',
      'is_enabled', true,
      'template', jsonb_build_object(
        'subject', 'Deal flagged: {{deal_name}}',
        'body', 'Hi {{recipient_name}},

{{actor_name}} flagged "{{deal_name}}".{{flag_note_email_suffix}}

Open the deal to review and resolve the flag.'
      )
    ),
    jsonb_build_object(
      'channel_type', 'slack',
      'is_enabled', false,
      'template', jsonb_build_object(
        'body', '🚩 *{{deal_name}}* flagged by *{{actor_name}}*{{flag_note_suffix}}'
      )
    )
  ),
  is_enabled = true,
  updated_at = now()
WHERE trigger_key = 'deal_flagged';