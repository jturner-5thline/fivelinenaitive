
-- Create deal memo audit log table
CREATE TABLE public.deal_memo_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID,
  user_display_name TEXT,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deal_memo_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: users in same company can view
CREATE POLICY "Company members can view memo audit logs"
  ON public.deal_memo_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = deal_memo_audit_logs.deal_id
        AND cm.user_id = auth.uid()
    )
  );

-- Policy: authenticated users can insert
CREATE POLICY "Authenticated users can insert memo audit logs"
  ON public.deal_memo_audit_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Index for fast lookups
CREATE INDEX idx_deal_memo_audit_logs_deal_id ON public.deal_memo_audit_logs(deal_id);
