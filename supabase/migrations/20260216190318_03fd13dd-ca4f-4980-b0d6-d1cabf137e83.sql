
-- Create lender audit logs table
CREATE TABLE public.lender_audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lender_id UUID NOT NULL REFERENCES public.master_lenders(id) ON DELETE CASCADE,
  user_id UUID,
  user_display_name TEXT,
  action TEXT NOT NULL, -- 'created', 'updated', 'contact_added', 'contact_removed', 'attachment_added', 'attachment_removed'
  field_changed TEXT, -- which field was changed (for updates)
  old_value TEXT,
  new_value TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by lender
CREATE INDEX idx_lender_audit_logs_lender_id ON public.lender_audit_logs(lender_id);
CREATE INDEX idx_lender_audit_logs_created_at ON public.lender_audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.lender_audit_logs ENABLE ROW LEVEL SECURITY;

-- Company members can view audit logs for their company's lenders
CREATE POLICY "Company members can view lender audit logs"
ON public.lender_audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.master_lenders ml
    JOIN public.company_members cm ON cm.company_id = ml.company_id
    WHERE ml.id = lender_audit_logs.lender_id
      AND cm.user_id = auth.uid()
  )
);

-- Company members can insert audit logs for their company's lenders
CREATE POLICY "Company members can insert lender audit logs"
ON public.lender_audit_logs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.master_lenders ml
    JOIN public.company_members cm ON cm.company_id = ml.company_id
    WHERE ml.id = lender_audit_logs.lender_id
      AND cm.user_id = auth.uid()
  )
);
