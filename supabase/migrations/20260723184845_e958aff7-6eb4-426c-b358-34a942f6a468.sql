
CREATE TABLE public.admin_agent_processed_reply_triggers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL,
  source TEXT NOT NULL,
  message_id TEXT NOT NULL,
  thread_id TEXT,
  from_email TEXT,
  received_at TIMESTAMPTZ,
  rule TEXT NOT NULL DEFAULT 'lender_followup',
  cleared_item_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX admin_agent_processed_reply_triggers_uniq
  ON public.admin_agent_processed_reply_triggers (deal_id, rule, source, message_id);

CREATE INDEX admin_agent_processed_reply_triggers_deal_idx
  ON public.admin_agent_processed_reply_triggers (deal_id, rule);

GRANT SELECT ON public.admin_agent_processed_reply_triggers TO authenticated;
GRANT ALL ON public.admin_agent_processed_reply_triggers TO service_role;

ALTER TABLE public.admin_agent_processed_reply_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages processed triggers"
  ON public.admin_agent_processed_reply_triggers
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can read processed triggers"
  ON public.admin_agent_processed_reply_triggers
  FOR SELECT
  TO authenticated
  USING (true);
