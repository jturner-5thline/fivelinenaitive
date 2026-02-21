-- Team/User email labels
CREATE TABLE public.email_labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  scope TEXT NOT NULL DEFAULT 'team' CHECK (scope IN ('team', 'user')),
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Label rules for smart auto-labeling
CREATE TABLE public.email_label_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label_id UUID NOT NULL REFERENCES public.email_labels(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN ('sender_email', 'sender_domain', 'recipient_email', 'subject', 'body', 'deal_name', 'category')),
  operator TEXT NOT NULL CHECK (operator IN ('contains', 'equals', 'starts_with', 'ends_with', 'regex')),
  value TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Thread-level label associations
CREATE TABLE public.email_thread_labels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id TEXT NOT NULL,
  label_id UUID NOT NULL REFERENCES public.email_labels(id) ON DELETE CASCADE,
  applied_by UUID REFERENCES auth.users(id),
  applied_via TEXT NOT NULL DEFAULT 'manual' CHECK (applied_via IN ('manual', 'rule')),
  rule_id UUID REFERENCES public.email_label_rules(id) ON DELETE SET NULL,
  is_removed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (thread_id, label_id)
);

-- RLS policies
ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_label_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_thread_labels ENABLE ROW LEVEL SECURITY;

-- email_labels: team labels visible to company members, user labels to owner
CREATE POLICY "View team labels" ON public.email_labels
  FOR SELECT USING (
    (scope = 'team' AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
    OR (scope = 'user' AND user_id = auth.uid())
  );

CREATE POLICY "Admins manage team labels" ON public.email_labels
  FOR ALL USING (
    (scope = 'team' AND company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ))
    OR (scope = 'user' AND user_id = auth.uid())
  );

-- email_label_rules: same access as parent label
CREATE POLICY "View label rules" ON public.email_label_rules
  FOR SELECT USING (
    label_id IN (SELECT id FROM public.email_labels WHERE
      (scope = 'team' AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
      OR (scope = 'user' AND user_id = auth.uid())
    )
  );

CREATE POLICY "Manage label rules" ON public.email_label_rules
  FOR ALL USING (
    label_id IN (SELECT id FROM public.email_labels WHERE
      (scope = 'team' AND company_id IN (
        SELECT company_id FROM public.company_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      ))
      OR (scope = 'user' AND user_id = auth.uid())
    )
  );

-- email_thread_labels: company members can view/manage
CREATE POLICY "View thread labels" ON public.email_thread_labels
  FOR SELECT USING (
    label_id IN (SELECT id FROM public.email_labels WHERE
      (scope = 'team' AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
      OR (scope = 'user' AND user_id = auth.uid())
    )
  );

CREATE POLICY "Manage thread labels" ON public.email_thread_labels
  FOR ALL USING (
    applied_by = auth.uid()
    OR label_id IN (SELECT id FROM public.email_labels WHERE
      scope = 'team' AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_email_labels_updated_at
  BEFORE UPDATE ON public.email_labels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_label_rules_updated_at
  BEFORE UPDATE ON public.email_label_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();