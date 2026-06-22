CREATE TABLE public.admin_agent_tone_deltas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID,
  queue_item_id UUID,
  action_type TEXT NOT NULL,
  original_draft JSONB NOT NULL DEFAULT '{}'::jsonb,
  edited_draft JSONB NOT NULL DEFAULT '{}'::jsonb,
  diff_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_agent_tone_deltas_user_recent
  ON public.admin_agent_tone_deltas (user_id, created_at DESC);
CREATE INDEX idx_admin_agent_tone_deltas_company
  ON public.admin_agent_tone_deltas (company_id, created_at DESC);

GRANT SELECT ON public.admin_agent_tone_deltas TO authenticated;
GRANT ALL ON public.admin_agent_tone_deltas TO service_role;

ALTER TABLE public.admin_agent_tone_deltas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own tone deltas"
  ON public.admin_agent_tone_deltas
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);