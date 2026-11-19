CREATE TABLE public.mcp_lender_write_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tool text NOT NULL,
  idempotency_key text,
  target_table text NOT NULL,
  target_id uuid,
  lender_id uuid,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX mcp_lender_write_log_idem_uq ON public.mcp_lender_write_log(user_id, tool, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX mcp_lender_write_log_target_idx ON public.mcp_lender_write_log(target_table, target_id);
GRANT SELECT, INSERT ON public.mcp_lender_write_log TO authenticated;
GRANT ALL ON public.mcp_lender_write_log TO service_role;
ALTER TABLE public.mcp_lender_write_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own mcp lender writes" ON public.mcp_lender_write_log FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users log own mcp lender writes" ON public.mcp_lender_write_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());