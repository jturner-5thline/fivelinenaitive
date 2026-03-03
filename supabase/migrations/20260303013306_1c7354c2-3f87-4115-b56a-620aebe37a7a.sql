
-- Request statuses enum
CREATE TYPE public.client_request_status AS ENUM ('pending', 'queued_for_email', 'included_in_draft', 'approved', 'sent');
CREATE TYPE public.client_draft_status AS ENUM ('needs_approval', 'approved', 'rejected', 'sent');

-- Client requests table
CREATE TABLE public.client_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  thread_id TEXT, -- Nylas/Gmail thread ID for the email thread
  client_email TEXT,
  client_name TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status public.client_request_status NOT NULL DEFAULT 'pending',
  draft_id UUID, -- linked when included in a draft
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  company_id UUID REFERENCES public.companies(id)
);

-- Email drafts for batched requests
CREATE TABLE public.client_request_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  thread_id TEXT, -- reply to this thread
  client_email TEXT,
  client_name TEXT,
  subject TEXT,
  body_html TEXT NOT NULL,
  body_text TEXT,
  status public.client_draft_status NOT NULL DEFAULT 'needs_approval',
  request_count INT NOT NULL DEFAULT 0,
  trigger_reason TEXT, -- 'count_threshold' or 'time_threshold'
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES auth.users(id),
  rejected_at TIMESTAMPTZ,
  rejection_notes TEXT,
  sent_at TIMESTAMPTZ,
  new_requests_pending BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id UUID REFERENCES public.companies(id)
);

-- Add foreign key from requests to drafts
ALTER TABLE public.client_requests ADD CONSTRAINT client_requests_draft_id_fkey
  FOREIGN KEY (draft_id) REFERENCES public.client_request_drafts(id) ON DELETE SET NULL;

-- Audit log for request batching
CREATE TABLE public.client_request_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  draft_id UUID REFERENCES public.client_request_drafts(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- draft_created, approved, rejected, sent
  performed_by UUID REFERENCES auth.users(id),
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_request_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_request_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for client_requests
CREATE POLICY "Users can view requests in their company"
  ON public.client_requests FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create requests in their company"
  ON public.client_requests FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can update requests in their company"
  ON public.client_requests FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete requests in their company"
  ON public.client_requests FOR DELETE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- RLS policies for client_request_drafts
CREATE POLICY "Users can view drafts in their company"
  ON public.client_request_drafts FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can create drafts in their company"
  ON public.client_request_drafts FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can update drafts in their company"
  ON public.client_request_drafts FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- RLS policies for audit log
CREATE POLICY "Users can view audit logs in their company"
  ON public.client_request_audit_log FOR SELECT TO authenticated
  USING (draft_id IN (
    SELECT id FROM public.client_request_drafts 
    WHERE company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  ));

CREATE POLICY "Users can create audit log entries"
  ON public.client_request_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_client_requests_deal_status ON public.client_requests(deal_id, status);
CREATE INDEX idx_client_requests_thread ON public.client_requests(thread_id, status);
CREATE INDEX idx_client_requests_company ON public.client_requests(company_id);
CREATE INDEX idx_client_request_drafts_deal ON public.client_request_drafts(deal_id);
CREATE INDEX idx_client_request_drafts_status ON public.client_request_drafts(status);
CREATE INDEX idx_client_request_drafts_company ON public.client_request_drafts(company_id);

-- Triggers for updated_at
CREATE TRIGGER update_client_requests_updated_at
  BEFORE UPDATE ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_request_drafts_updated_at
  BEFORE UPDATE ON public.client_request_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
