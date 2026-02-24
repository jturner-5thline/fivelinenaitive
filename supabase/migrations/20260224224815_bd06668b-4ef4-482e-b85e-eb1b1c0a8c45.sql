
-- Add approval fields to deal_memos
ALTER TABLE public.deal_memos
  ADD COLUMN IF NOT EXISTS approval_state text NOT NULL DEFAULT 'not_submitted',
  ADD COLUMN IF NOT EXISTS current_approval_level text,
  ADD COLUMN IF NOT EXISTS current_approver_user_id uuid,
  ADD COLUMN IF NOT EXISTS last_submitted_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Create approval history table
CREATE TABLE public.deal_memo_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  deal_memo_id uuid NOT NULL REFERENCES public.deal_memos(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  approver_user_id uuid NOT NULL,
  approver_role text NOT NULL, -- 'deal_manager' or 'admin'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  rejection_reason text,
  task_id uuid, -- reference to auto-created task
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.deal_memo_approvals ENABLE ROW LEVEL SECURITY;

-- RLS: company members can view approvals for deals in their company
CREATE POLICY "Company members can view deal memo approvals"
  ON public.deal_memo_approvals FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = deal_memo_approvals.deal_id
        AND cm.user_id = auth.uid()
    )
  );

-- RLS: authenticated users can insert approvals (validation done in app)
CREATE POLICY "Authenticated users can create approvals"
  ON public.deal_memo_approvals FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

-- RLS: approver can update their approval
CREATE POLICY "Approver can update approval"
  ON public.deal_memo_approvals FOR UPDATE TO authenticated
  USING (approver_user_id = auth.uid());
