
-- Table to store mapping patterns for AI learning loop
CREATE TABLE public.mapping_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  source_label TEXT NOT NULL,
  source_label_normalized TEXT NOT NULL,
  mapped_field TEXT NOT NULL,
  field_category TEXT NOT NULL DEFAULT 'financial',
  action TEXT NOT NULL CHECK (action IN ('accepted', 'rejected', 'changed')),
  confidence REAL,
  suggested_by TEXT NOT NULL DEFAULT 'ai',
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index for fast lookups during suggestion generation
CREATE INDEX idx_mapping_patterns_lookup ON public.mapping_patterns (company_id, source_label_normalized, mapped_field);
CREATE INDEX idx_mapping_patterns_field ON public.mapping_patterns (mapped_field, action);

-- Enable RLS
ALTER TABLE public.mapping_patterns ENABLE ROW LEVEL SECURITY;

-- RLS: users can manage patterns for their company
CREATE POLICY "Users can view own company patterns"
  ON public.mapping_patterns FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert patterns for own company"
  ON public.mapping_patterns FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own company patterns"
  ON public.mapping_patterns FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- Auto-update timestamp
CREATE TRIGGER update_mapping_patterns_updated_at
  BEFORE UPDATE ON public.mapping_patterns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
