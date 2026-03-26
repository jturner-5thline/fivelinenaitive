
-- 1. Create deal_audit_log table
CREATE TABLE public.deal_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  entity_name text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_audit_log_deal_id ON public.deal_audit_log(deal_id);
CREATE INDEX idx_deal_audit_log_created_at ON public.deal_audit_log(created_at DESC);
CREATE INDEX idx_deal_audit_log_action_type ON public.deal_audit_log(action_type);

ALTER TABLE public.deal_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: users can see audit logs for deals in their company
CREATE POLICY "Users can view audit logs for their company deals"
  ON public.deal_audit_log FOR SELECT TO authenticated
  USING (
    deal_id IN (
      SELECT d.id FROM public.deals d
      WHERE d.company_id = ANY(public.get_user_company_ids(auth.uid()))
    )
  );

-- RLS: authenticated users can insert audit logs for their company deals
CREATE POLICY "Users can insert audit logs for their company deals"
  ON public.deal_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND deal_id IN (
      SELECT d.id FROM public.deals d
      WHERE d.company_id = ANY(public.get_user_company_ids(auth.uid()))
    )
  );

-- 2. Add soft-delete columns to vdr_documents (additive only)
ALTER TABLE public.vdr_documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.vdr_documents ADD COLUMN IF NOT EXISTS deleted_by uuid;
