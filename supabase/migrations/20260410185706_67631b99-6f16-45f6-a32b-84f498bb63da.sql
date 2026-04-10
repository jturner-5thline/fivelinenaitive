
-- Table for deal-level email workflow prompts/recommendations
CREATE TABLE public.deal_email_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workflow_key TEXT NOT NULL,
  workflow_name TEXT NOT NULL,
  trigger_reason TEXT NOT NULL,
  email_template_number INTEGER NOT NULL,
  recipients_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  merged_subject TEXT NOT NULL DEFAULT '',
  merged_body_html TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dismissed', 'sent')),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  sent_by UUID,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_deal_email_prompts_deal ON public.deal_email_prompts(deal_id);
CREATE INDEX idx_deal_email_prompts_company ON public.deal_email_prompts(company_id);
CREATE INDEX idx_deal_email_prompts_status ON public.deal_email_prompts(status);

-- RLS
ALTER TABLE public.deal_email_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view their deal email prompts"
  ON public.deal_email_prompts FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can update prompt status"
  ON public.deal_email_prompts FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can create prompts"
  ON public.deal_email_prompts FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

-- Timestamp trigger
CREATE TRIGGER update_deal_email_prompts_updated_at
  BEFORE UPDATE ON public.deal_email_prompts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
