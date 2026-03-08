
-- =============================================
-- Feature 1: AI Field Suggestions
-- =============================================

-- Suggestion entity
CREATE TABLE public.contact_field_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  current_value TEXT,
  suggested_value TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  source_snippet TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  dedupe_key TEXT NOT NULL,
  snoozed_until TIMESTAMPTZ,
  acted_by_user_id UUID,
  acted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (dedupe_key)
);

-- Indexes
CREATE INDEX idx_cfs_contact_status ON public.contact_field_suggestions (contact_id, status);
CREATE INDEX idx_cfs_status_created ON public.contact_field_suggestions (status, created_at DESC);
CREATE INDEX idx_cfs_company_status ON public.contact_field_suggestions (company_id, status);
CREATE INDEX idx_cfs_field_status ON public.contact_field_suggestions (field_name, status);

-- Audit log
CREATE TABLE public.contact_field_suggestion_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES public.contact_field_suggestions(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  action TEXT NOT NULL,
  actor_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Per-field confidence thresholds
CREATE TABLE public.field_suggestion_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  min_confidence NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, field_name)
);

-- Updated timestamp trigger
CREATE TRIGGER update_cfs_updated_at
  BEFORE UPDATE ON public.contact_field_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- RLS Policies
-- =============================================

ALTER TABLE public.contact_field_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view suggestions"
  ON public.contact_field_suggestions FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id)
         OR public.is_5thline_user(auth.uid()));

CREATE POLICY "Company members can update suggestions"
  ON public.contact_field_suggestions FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id)
         OR public.is_5thline_user(auth.uid()));

-- Audit table RLS
ALTER TABLE public.contact_field_suggestion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view suggestion audit"
  ON public.contact_field_suggestion_audit FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.contact_field_suggestions cfs
    WHERE cfs.id = suggestion_id
      AND (public.is_company_member(auth.uid(), cfs.company_id)
           OR public.is_5thline_user(auth.uid()))
  ));

-- Thresholds RLS
ALTER TABLE public.field_suggestion_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can manage thresholds"
  ON public.field_suggestion_thresholds FOR ALL TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id)
         OR public.is_5thline_user(auth.uid()));
