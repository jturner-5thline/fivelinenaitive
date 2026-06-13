
-- Stage 4: extend selected actions for richer persistence + add parse log

ALTER TABLE public.admin_agent_selected_actions
  DROP CONSTRAINT IF EXISTS admin_agent_selected_actions_action_check;

ALTER TABLE public.admin_agent_selected_actions
  ADD CONSTRAINT admin_agent_selected_actions_action_check
  CHECK (action = ANY (ARRAY['update','create','ignore','follow_up']));

ALTER TABLE public.admin_agent_selected_actions
  ADD COLUMN IF NOT EXISTS scope_level text NOT NULL DEFAULT 'field',
  ADD COLUMN IF NOT EXISTS raw_user_response text,
  ADD COLUMN IF NOT EXISTS parsed_interpretation jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confirmation_status text NOT NULL DEFAULT 'unconfirmed';

ALTER TABLE public.admin_agent_selected_actions
  DROP CONSTRAINT IF EXISTS aasa_scope_level_check;
ALTER TABLE public.admin_agent_selected_actions
  ADD CONSTRAINT aasa_scope_level_check
  CHECK (scope_level = ANY (ARRAY['portfolio','deal','field']));

ALTER TABLE public.admin_agent_selected_actions
  DROP CONSTRAINT IF EXISTS aasa_confirmation_status_check;
ALTER TABLE public.admin_agent_selected_actions
  ADD CONSTRAINT aasa_confirmation_status_check
  CHECK (confirmation_status = ANY (ARRAY['unconfirmed','clarification_pending','confirmed','dismissed']));

CREATE INDEX IF NOT EXISTS idx_aasa_confirmation
  ON public.admin_agent_selected_actions (company_id, confirmation_status, created_at DESC);

-- Parse / observability log for chat follow-ups
CREATE TABLE IF NOT EXISTS public.admin_agent_parse_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid,
  audit_run_id uuid REFERENCES public.admin_agent_audit_runs(id) ON DELETE SET NULL,
  raw_user_response text,
  parsed_interpretation jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text NOT NULL,
  clarifying_question text,
  selections_created integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aapl_outcome_check CHECK (outcome = ANY (ARRAY['parsed','clarification_needed','no_op','error']))
);

GRANT SELECT, INSERT ON public.admin_agent_parse_logs TO authenticated;
GRANT ALL ON public.admin_agent_parse_logs TO service_role;

ALTER TABLE public.admin_agent_parse_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aapl_select_company" ON public.admin_agent_parse_logs
  FOR SELECT TO authenticated
  USING (company_id IN (SELECT unnest(get_user_company_ids(auth.uid()))));

CREATE POLICY "aapl_insert_company" ON public.admin_agent_parse_logs
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT unnest(get_user_company_ids(auth.uid()))));

CREATE INDEX IF NOT EXISTS idx_aapl_company_created
  ON public.admin_agent_parse_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aapl_audit_run
  ON public.admin_agent_parse_logs (audit_run_id);
