
-- Email Workflows configuration table
CREATE TABLE public.email_workflows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence_type TEXT NOT NULL DEFAULT 'one_off',
  action_type TEXT NOT NULL DEFAULT 'send_email',
  trigger_type TEXT NOT NULL DEFAULT 'stage_enter',
  trigger_event TEXT NOT NULL,
  pipeline_name TEXT,
  stage_name TEXT,
  email_template_number INTEGER,
  email_template_id UUID,
  email_template_title TEXT,
  send_timing TEXT,
  audience TEXT DEFAULT 'client',
  comm_type TEXT,
  default_subject TEXT,
  notes TEXT,
  show_in_deal_prompt BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  auto_recommend_cc BOOLEAN NOT NULL DEFAULT true,
  prevent_duplicate_send BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view email workflows"
  ON public.email_workflows FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company admins can insert email workflows"
  ON public.email_workflows FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can update email workflows"
  ON public.email_workflows FOR UPDATE TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can delete email workflows"
  ON public.email_workflows FOR DELETE TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id));

CREATE TRIGGER update_email_workflows_updated_at
  BEFORE UPDATE ON public.email_workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Email Workflow Events tracking table
CREATE TABLE public.email_workflow_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES public.email_workflows(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_template_id UUID,
  prompt_id UUID REFERENCES public.deal_email_prompts(id) ON DELETE SET NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prompt_shown_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  deferred_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'triggered',
  sent_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_workflow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view workflow events"
  ON public.email_workflow_events FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can insert workflow events"
  ON public.email_workflow_events FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can update workflow events"
  ON public.email_workflow_events FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE TRIGGER update_email_workflow_events_updated_at
  BEFORE UPDATE ON public.email_workflow_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_email_workflows_company ON public.email_workflows(company_id);
CREATE INDEX idx_email_workflow_events_deal ON public.email_workflow_events(deal_id);
CREATE INDEX idx_email_workflow_events_workflow ON public.email_workflow_events(workflow_id);
CREATE INDEX idx_email_workflow_events_status ON public.email_workflow_events(status);
