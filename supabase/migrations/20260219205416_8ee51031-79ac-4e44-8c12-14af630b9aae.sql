
-- Persistent agent memory for cross-session context
CREATE TABLE public.agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'fact',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  importance SMALLINT DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_agent_memory_agent_user ON public.agent_memory(agent_id, user_id);
CREATE INDEX idx_agent_memory_type ON public.agent_memory(memory_type);
CREATE INDEX idx_agent_memory_key ON public.agent_memory(key);

-- Auto-update timestamps
CREATE TRIGGER update_agent_memory_updated_at
  BEFORE UPDATE ON public.agent_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

-- Users can manage their own agent memories
CREATE POLICY "Users can view own agent memories"
  ON public.agent_memory FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agent memories"
  ON public.agent_memory FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agent memories"
  ON public.agent_memory FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own agent memories"
  ON public.agent_memory FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Slack channel-to-agent routing table
CREATE TABLE public.slack_agent_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  slack_channel_id TEXT NOT NULL,
  slack_channel_name TEXT,
  is_active BOOLEAN DEFAULT true,
  route_type TEXT NOT NULL DEFAULT 'channel',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(slack_channel_id, agent_id)
);

CREATE INDEX idx_slack_routes_channel ON public.slack_agent_routes(slack_channel_id);
CREATE INDEX idx_slack_routes_agent ON public.slack_agent_routes(agent_id);

CREATE TRIGGER update_slack_agent_routes_updated_at
  BEFORE UPDATE ON public.slack_agent_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.slack_agent_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own slack routes"
  ON public.slack_agent_routes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own slack routes"
  ON public.slack_agent_routes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own slack routes"
  ON public.slack_agent_routes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own slack routes"
  ON public.slack_agent_routes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- SLA tracking table for deal follow-up reminders
CREATE TABLE public.deal_sla_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT NOT NULL DEFAULT 'stale_deal',
  conditions JSONB NOT NULL DEFAULT '{}',
  action_type TEXT NOT NULL DEFAULT 'slack_notify',
  action_config JSONB NOT NULL DEFAULT '{}',
  slack_channel_id TEXT,
  is_active BOOLEAN DEFAULT true,
  check_interval_hours INT DEFAULT 24,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_sla_rules_user ON public.deal_sla_rules(user_id);
CREATE INDEX idx_deal_sla_rules_active ON public.deal_sla_rules(is_active) WHERE is_active = true;

CREATE TRIGGER update_deal_sla_rules_updated_at
  BEFORE UPDATE ON public.deal_sla_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.deal_sla_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sla rules"
  ON public.deal_sla_rules FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sla rules"
  ON public.deal_sla_rules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sla rules"
  ON public.deal_sla_rules FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sla rules"
  ON public.deal_sla_rules FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
