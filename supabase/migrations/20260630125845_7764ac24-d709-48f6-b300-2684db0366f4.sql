
CREATE TABLE IF NOT EXISTS public.agent_learned_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  agent_key TEXT NOT NULL DEFAULT 'admin_agent',
  rule_text TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'approval_feedback',
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','active','dismissed')),
  confidence NUMERIC(3,2) DEFAULT 0.50,
  occurrences INT NOT NULL DEFAULT 1,
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  last_synthesized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alr_company_agent_status
  ON public.agent_learned_rules (company_id, agent_key, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_learned_rules TO authenticated;
GRANT ALL ON public.agent_learned_rules TO service_role;

ALTER TABLE public.agent_learned_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view learned rules"
  ON public.agent_learned_rules FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = agent_learned_rules.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "members can decide learned rules"
  ON public.agent_learned_rules FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = agent_learned_rules.company_id
        AND cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = agent_learned_rules.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "admins can insert learned rules"
  ON public.agent_learned_rules FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = agent_learned_rules.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "admins can delete learned rules"
  ON public.agent_learned_rules FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = agent_learned_rules.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_alr_updated_at
  BEFORE UPDATE ON public.agent_learned_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
