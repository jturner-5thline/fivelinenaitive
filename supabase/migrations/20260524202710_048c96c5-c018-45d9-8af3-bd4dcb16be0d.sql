CREATE TABLE public.ai_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  reason text NOT NULL,
  thread_id text,
  contact_id uuid,
  actor_user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_action_log_company_created
  ON public.ai_action_log (company_id, created_at DESC);
CREATE INDEX idx_ai_action_log_action_reason
  ON public.ai_action_log (action, reason);

ALTER TABLE public.ai_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_action_log_admin_select"
  ON public.ai_action_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "ai_action_log_self_insert"
  ON public.ai_action_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND company_id = ANY (public.get_user_company_ids(auth.uid()))
  );