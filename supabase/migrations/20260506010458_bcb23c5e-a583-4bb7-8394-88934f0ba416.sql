
-- Comments on QIR widgets/sections
CREATE TABLE public.qir_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  report_key TEXT NOT NULL,        -- e.g. 'naitive.quarterlyReport.v1.report1'
  target_type TEXT NOT NULL,       -- 'kpi' | 'section' | 'narrative' | 'goal' | 'initiative' | 'risk'
  target_id TEXT NOT NULL,         -- id of the kpi/goal/etc, or section key
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  mentioned_user_ids UUID[] NOT NULL DEFAULT '{}',
  author_user_id UUID NOT NULL,
  author_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qir_comments_company ON public.qir_comments(company_id, report_key, created_at DESC);
CREATE INDEX idx_qir_comments_target ON public.qir_comments(company_id, report_key, target_type, target_id);

ALTER TABLE public.qir_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read qir comments"
ON public.qir_comments FOR SELECT TO authenticated
USING (company_id = ANY (get_user_company_ids(auth.uid())));

CREATE POLICY "Company members can insert qir comments"
ON public.qir_comments FOR INSERT TO authenticated
WITH CHECK (
  company_id = ANY (get_user_company_ids(auth.uid()))
  AND author_user_id = auth.uid()
);

CREATE POLICY "Author or admin can update qir comments"
ON public.qir_comments FOR UPDATE TO authenticated
USING (
  company_id = ANY (get_user_company_ids(auth.uid()))
  AND (author_user_id = auth.uid() OR is_admin(auth.uid()))
);

CREATE POLICY "Author or admin can delete qir comments"
ON public.qir_comments FOR DELETE TO authenticated
USING (
  company_id = ANY (get_user_company_ids(auth.uid()))
  AND (author_user_id = auth.uid() OR is_admin(auth.uid()))
);

-- Section narrative notes
CREATE TABLE public.qir_section_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  report_key TEXT NOT NULL,
  section_key TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 8000),
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, report_key, section_key)
);

ALTER TABLE public.qir_section_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read qir section notes"
ON public.qir_section_notes FOR SELECT TO authenticated
USING (company_id = ANY (get_user_company_ids(auth.uid())));

CREATE POLICY "Company members can upsert qir section notes"
ON public.qir_section_notes FOR INSERT TO authenticated
WITH CHECK (company_id = ANY (get_user_company_ids(auth.uid())));

CREATE POLICY "Company members can update qir section notes"
ON public.qir_section_notes FOR UPDATE TO authenticated
USING (company_id = ANY (get_user_company_ids(auth.uid())));

-- updated_at trigger
CREATE TRIGGER trg_qir_comments_updated_at
BEFORE UPDATE ON public.qir_comments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_qir_section_notes_updated_at
BEFORE UPDATE ON public.qir_section_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.qir_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.qir_section_notes;
