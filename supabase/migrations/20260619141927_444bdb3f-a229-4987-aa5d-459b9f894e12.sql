
ALTER TABLE public.ai_action_queue
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS risk_level text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS target_object_type text,
  ADD COLUMN IF NOT EXISTS target_object_id uuid,
  ADD COLUMN IF NOT EXISTS old_values jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS new_values jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rationale text,
  ADD COLUMN IF NOT EXISTS edited_before_approval boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reassigned_from uuid,
  ADD COLUMN IF NOT EXISTS more_context_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS more_context_notes text;

UPDATE public.ai_action_queue SET assigned_to = user_id WHERE assigned_to IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_action_queue_priority_check') THEN
    ALTER TABLE public.ai_action_queue
      ADD CONSTRAINT ai_action_queue_priority_check
      CHECK (priority IN ('low','normal','high','urgent'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_action_queue_risk_check') THEN
    ALTER TABLE public.ai_action_queue
      ADD CONSTRAINT ai_action_queue_risk_check
      CHECK (risk_level IN ('low','medium','high'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_action_queue_assigned_to ON public.ai_action_queue(assigned_to);
CREATE INDEX IF NOT EXISTS idx_ai_action_queue_target ON public.ai_action_queue(target_object_type, target_object_id);

CREATE TABLE IF NOT EXISTS public.approval_queue_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_queue_id uuid NOT NULL REFERENCES public.ai_action_queue(id) ON DELETE CASCADE,
  target_object_type text,
  target_object_id uuid,
  action_type text NOT NULL,
  old_values jsonb DEFAULT '{}'::jsonb,
  new_values jsonb DEFAULT '{}'::jsonb,
  approver_user_id uuid,
  decision text NOT NULL CHECK (decision IN ('approved','rejected','reassigned','edited_approved','more_context','email_staged','email_sent')),
  execution_status text NOT NULL CHECK (execution_status IN ('success','failed','staged','noop')),
  failure_reason text,
  was_edited boolean DEFAULT false,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.approval_queue_audit TO authenticated;
GRANT ALL ON public.approval_queue_audit TO service_role;
ALTER TABLE public.approval_queue_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approver can view their audit rows"
  ON public.approval_queue_audit FOR SELECT TO authenticated
  USING (approver_user_id = auth.uid());

CREATE POLICY "Approver can insert their audit rows"
  ON public.approval_queue_audit FOR INSERT TO authenticated
  WITH CHECK (approver_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_approval_queue_audit_queue ON public.approval_queue_audit(action_queue_id);
CREATE INDEX IF NOT EXISTS idx_approval_queue_audit_target ON public.approval_queue_audit(target_object_type, target_object_id);

CREATE TABLE IF NOT EXISTS public.staged_email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_action_id uuid REFERENCES public.ai_action_queue(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  deal_id uuid,
  thread_id text,
  to_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text,
  body_html text,
  body_text text,
  attachments jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','sent','cancelled')),
  staged_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staged_email_drafts TO authenticated;
GRANT ALL ON public.staged_email_drafts TO service_role;
ALTER TABLE public.staged_email_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User can view their staged drafts"
  ON public.staged_email_drafts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "User can insert their staged drafts"
  ON public.staged_email_drafts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "User can update their staged drafts"
  ON public.staged_email_drafts FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "User can delete their staged drafts"
  ON public.staged_email_drafts FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_staged_email_drafts_user_status ON public.staged_email_drafts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_staged_email_drafts_deal ON public.staged_email_drafts(deal_id);

DROP TRIGGER IF EXISTS trg_staged_email_drafts_updated_at ON public.staged_email_drafts;
CREATE TRIGGER trg_staged_email_drafts_updated_at
  BEFORE UPDATE ON public.staged_email_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
