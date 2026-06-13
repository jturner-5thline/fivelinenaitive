CREATE TABLE public.admin_agent_selected_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_id uuid REFERENCES public.admin_agent_audit_runs(id) ON DELETE SET NULL,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  deal_id uuid,
  field text NOT NULL,
  lender_id uuid,
  action text NOT NULL CHECK (action IN ('update','create','ignore')),
  note text,
  source_message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','queued','executed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_aasa_company ON public.admin_agent_selected_actions(company_id, created_at DESC);
CREATE INDEX idx_aasa_run ON public.admin_agent_selected_actions(audit_run_id);
CREATE INDEX idx_aasa_deal ON public.admin_agent_selected_actions(deal_id);

GRANT SELECT, INSERT, UPDATE ON public.admin_agent_selected_actions TO authenticated;
GRANT ALL ON public.admin_agent_selected_actions TO service_role;

ALTER TABLE public.admin_agent_selected_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aasa_select_company"
  ON public.admin_agent_selected_actions FOR SELECT TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "aasa_insert_self"
  ON public.admin_agent_selected_actions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
              AND company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "aasa_update_company"
  ON public.admin_agent_selected_actions FOR UPDATE TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))))
  WITH CHECK (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE TRIGGER trg_aasa_updated_at
  BEFORE UPDATE ON public.admin_agent_selected_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();