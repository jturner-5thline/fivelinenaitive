
-- Drop partially created enums from failed migration
DROP TYPE IF EXISTS public.wf_user_role CASCADE;
DROP TYPE IF EXISTS public.wf_deal_stage CASCADE;
DROP TYPE IF EXISTS public.wf_task_status CASCADE;
DROP TYPE IF EXISTS public.wf_trigger_source CASCADE;
DROP TYPE IF EXISTS public.wf_trigger_type CASCADE;
DROP TYPE IF EXISTS public.wf_owner_role CASCADE;
DROP TYPE IF EXISTS public.wf_term_sheet_status CASCADE;
DROP TYPE IF EXISTS public.wf_invoice_type CASCADE;
DROP TYPE IF EXISTS public.wf_invoice_status CASCADE;
DROP TYPE IF EXISTS public.wf_email_status CASCADE;
DROP TYPE IF EXISTS public.wf_agreement_type CASCADE;
DROP TYPE IF EXISTS public.wf_meeting_type CASCADE;

-- Enums
CREATE TYPE public.wf_user_role AS ENUM ('manager', 'analyst', 'ops', 'admin', 'other');
CREATE TYPE public.wf_deal_stage AS ENUM (
  'nda_needs_list_sent', 'pre_credit_needs', 'analyst_completes_review',
  'not_moving_forward', 'manager_approves_preview', 'initial_lender_review',
  'initial_feedback_call', 'prop_in_dev', 'prop_issued', 'agreement_pending',
  'final_credit_items', 'client_strategy_review', 'write_up_pending',
  'submitted_to_lenders', 'lenders_in_review', 'terms_issued_analysis',
  'terms_issued_payment', 'due_diligence_client', 'funded_naitive',
  'funded_payment', 'funded_feedback_testimonials', 'funded_lender_review'
);
CREATE TYPE public.wf_task_status AS ENUM ('open', 'in_progress', 'done');
CREATE TYPE public.wf_trigger_source AS ENUM ('stage_change', 'calendar', 'email', 'manual', 'external');
CREATE TYPE public.wf_trigger_type AS ENUM ('stage_change', 'calendar_event', 'email_event', 'manual', 'external');
CREATE TYPE public.wf_owner_role AS ENUM ('manager', 'analyst', 'ops', 'system');
CREATE TYPE public.wf_term_sheet_status AS ENUM ('draft', 'received', 'approved', 'signed', 'rejected');
CREATE TYPE public.wf_invoice_type AS ENUM ('retainer', 'milestone', 'final');
CREATE TYPE public.wf_invoice_status AS ENUM ('draft', 'sent', 'paid');
CREATE TYPE public.wf_email_status AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE public.wf_agreement_type AS ENUM ('nda', 'engagement', 'amendment', 'other');
CREATE TYPE public.wf_meeting_type AS ENUM ('sales', 'bd', 'educational', 'kick_off', 'lender_meeting', 'other');

-- Tables
CREATE TABLE public.wf_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  role wf_user_role NOT NULL DEFAULT 'other',
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wf_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, company_name TEXT,
  stage wf_deal_stage NOT NULL DEFAULT 'nda_needs_list_sent',
  current_workflow TEXT,
  manager_id UUID REFERENCES public.wf_users(id) ON DELETE SET NULL,
  analyst_id UUID REFERENCES public.wf_users(id) ON DELETE SET NULL,
  ops_id UUID REFERENCES public.wf_users(id) ON DELETE SET NULL,
  client_email TEXT, agreement_status TEXT, proposal_status TEXT, funding_status TEXT,
  last_client_touch_at TIMESTAMPTZ,
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wf_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, role TEXT, firm_name TEXT, email TEXT, phone TEXT,
  owner_user_id UUID REFERENCES public.wf_users(id) ON DELETE SET NULL,
  last_contacted_at TIMESTAMPTZ, notes TEXT,
  is_lender BOOLEAN NOT NULL DEFAULT false, is_client BOOLEAN NOT NULL DEFAULT false,
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wf_lenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, type TEXT,
  primary_contact_id UUID REFERENCES public.wf_contacts(id) ON DELETE SET NULL,
  terms_profile_json JSONB, active BOOLEAN NOT NULL DEFAULT true,
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wf_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT,
  default_owner_role wf_owner_role NOT NULL DEFAULT 'manager',
  default_owner_user_id UUID REFERENCES public.wf_users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wf_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.wf_deals(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT,
  status wf_task_status NOT NULL DEFAULT 'open',
  due_at TIMESTAMPTZ,
  assignee_id UUID REFERENCES public.wf_users(id) ON DELETE SET NULL,
  created_by_id UUID REFERENCES public.wf_users(id) ON DELETE SET NULL,
  workflow_owner_id UUID REFERENCES public.wf_users(id) ON DELETE SET NULL,
  trigger_source wf_trigger_source NOT NULL DEFAULT 'manual',
  is_recurring BOOLEAN NOT NULL DEFAULT false, recurrence_rule_json JSONB,
  workflow_key TEXT,
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wf_workflows_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES public.wf_workflows(id) ON DELETE SET NULL,
  workflow_name TEXT NOT NULL,
  owner_user_id UUID REFERENCES public.wf_users(id) ON DELETE SET NULL,
  trigger_type wf_trigger_type NOT NULL,
  deal_id UUID REFERENCES public.wf_deals(id) ON DELETE SET NULL,
  metadata_json JSONB,
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wf_term_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.wf_deals(id) ON DELETE CASCADE NOT NULL,
  lender_id UUID REFERENCES public.wf_lenders(id) ON DELETE SET NULL,
  status wf_term_sheet_status NOT NULL DEFAULT 'draft',
  file_url TEXT, summary_json JSONB, received_at TIMESTAMPTZ, signed_at TIMESTAMPTZ,
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wf_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.wf_deals(id) ON DELETE CASCADE NOT NULL,
  type wf_invoice_type NOT NULL DEFAULT 'retainer',
  amount NUMERIC(12,2), status wf_invoice_status NOT NULL DEFAULT 'draft',
  link_url TEXT, sent_at TIMESTAMPTZ, paid_at TIMESTAMPTZ,
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wf_emails_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.wf_deals(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT, template_key TEXT,
  status wf_email_status NOT NULL DEFAULT 'pending',
  opened_at TIMESTAMPTZ, last_error TEXT, sent_at TIMESTAMPTZ,
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wf_workflow_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.wf_users(id) ON DELETE CASCADE,
  team_id UUID, stage wf_deal_stage, task_type_key TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true, grouped_mode BOOLEAN NOT NULL DEFAULT false,
  default_due_offset_days INTEGER DEFAULT 3, notify_via_email BOOLEAN NOT NULL DEFAULT true,
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wf_meeting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.wf_deals(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.wf_contacts(id) ON DELETE SET NULL,
  calendar_event_id TEXT, type wf_meeting_type NOT NULL DEFAULT 'other',
  notes TEXT, ai_summary TEXT,
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wf_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.wf_deals(id) ON DELETE CASCADE NOT NULL,
  type wf_agreement_type NOT NULL DEFAULT 'other',
  file_url TEXT, signed_at TIMESTAMPTZ, clauses_json JSONB,
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.wf_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_lenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_workflows_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_term_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_emails_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_workflow_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wf_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wf_users_access" ON public.wf_users FOR ALL TO authenticated
  USING (company_id IS NULL OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_users.company_id));
CREATE POLICY "wf_deals_access" ON public.wf_deals FOR ALL TO authenticated
  USING (org_company_id IS NULL OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_deals.org_company_id));
CREATE POLICY "wf_contacts_access" ON public.wf_contacts FOR ALL TO authenticated
  USING (org_company_id IS NULL OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_contacts.org_company_id));
CREATE POLICY "wf_lenders_access" ON public.wf_lenders FOR ALL TO authenticated
  USING (org_company_id IS NULL OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_lenders.org_company_id));
CREATE POLICY "wf_workflows_access" ON public.wf_workflows FOR ALL TO authenticated
  USING (org_company_id IS NULL OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_workflows.org_company_id));
CREATE POLICY "wf_tasks_access" ON public.wf_tasks FOR ALL TO authenticated
  USING (org_company_id IS NULL OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_tasks.org_company_id));
CREATE POLICY "wf_workflows_log_access" ON public.wf_workflows_log FOR ALL TO authenticated
  USING (org_company_id IS NULL OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_workflows_log.org_company_id));
CREATE POLICY "wf_term_sheets_access" ON public.wf_term_sheets FOR ALL TO authenticated
  USING (org_company_id IS NULL OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_term_sheets.org_company_id));
CREATE POLICY "wf_invoices_access" ON public.wf_invoices FOR ALL TO authenticated
  USING (org_company_id IS NULL OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_invoices.org_company_id));
CREATE POLICY "wf_emails_queue_access" ON public.wf_emails_queue FOR ALL TO authenticated
  USING (org_company_id IS NULL OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_emails_queue.org_company_id));
CREATE POLICY "wf_workflow_preferences_access" ON public.wf_workflow_preferences FOR ALL TO authenticated
  USING (org_company_id IS NULL OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_workflow_preferences.org_company_id));
CREATE POLICY "wf_meeting_notes_access" ON public.wf_meeting_notes FOR ALL TO authenticated
  USING (org_company_id IS NULL OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_meeting_notes.org_company_id));
CREATE POLICY "wf_agreements_access" ON public.wf_agreements FOR ALL TO authenticated
  USING (org_company_id IS NULL OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = auth.uid() AND cm.company_id = wf_agreements.org_company_id));

-- Triggers
CREATE TRIGGER update_wf_users_updated_at BEFORE UPDATE ON public.wf_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wf_deals_updated_at BEFORE UPDATE ON public.wf_deals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wf_contacts_updated_at BEFORE UPDATE ON public.wf_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wf_lenders_updated_at BEFORE UPDATE ON public.wf_lenders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wf_workflows_updated_at BEFORE UPDATE ON public.wf_workflows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wf_tasks_updated_at BEFORE UPDATE ON public.wf_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wf_term_sheets_updated_at BEFORE UPDATE ON public.wf_term_sheets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wf_invoices_updated_at BEFORE UPDATE ON public.wf_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wf_emails_queue_updated_at BEFORE UPDATE ON public.wf_emails_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wf_preferences_updated_at BEFORE UPDATE ON public.wf_workflow_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wf_meeting_notes_updated_at BEFORE UPDATE ON public.wf_meeting_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wf_agreements_updated_at BEFORE UPDATE ON public.wf_agreements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Stage change trigger
CREATE OR REPLACE FUNCTION public.wf_deal_stage_change_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO public.wf_workflows_log (workflow_name, trigger_type, deal_id, org_company_id, metadata_json)
    VALUES ('stage_change_' || NEW.stage::text, 'stage_change', NEW.id, NEW.org_company_id,
      jsonb_build_object('from_stage', OLD.stage::text, 'to_stage', NEW.stage::text));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER wf_deal_stage_change AFTER UPDATE ON public.wf_deals FOR EACH ROW EXECUTE FUNCTION public.wf_deal_stage_change_trigger();
