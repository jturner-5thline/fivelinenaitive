-- =========================================================
-- Branded AI Document Generation: tables + storage
-- =========================================================

-- 1) ai_style_templates: per-user saved style references
CREATE TABLE public.ai_style_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('image','url','manual')),
  source_value TEXT,                       -- URL or image storage path
  palette JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{name,hex,role}]
  fonts JSONB NOT NULL DEFAULT '{}'::jsonb,     -- {heading, body}
  layout_notes TEXT,                        -- AI-generated style description
  preview_image_path TEXT,                  -- optional thumbnail/screenshot path
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_style_templates_user ON public.ai_style_templates(user_id);

ALTER TABLE public.ai_style_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own style templates"
ON public.ai_style_templates
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER ai_style_templates_updated_at
BEFORE UPDATE ON public.ai_style_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2) ai_styled_documents: branded docs generated for a deal
CREATE TABLE public.ai_styled_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL,
  user_id UUID NOT NULL,
  document_type TEXT NOT NULL,             -- e.g. 'deal_summary_memo','borrower_profile','lender_pitch_one_pager','executive_summary','deal_teaser','term_sheet_summary'
  title TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb, -- ordered array of section keys
  style JSONB NOT NULL DEFAULT '{}'::jsonb,    -- snapshot of {palette, fonts, layout_notes, source}
  style_template_id UUID REFERENCES public.ai_style_templates(id) ON DELETE SET NULL,
  html TEXT NOT NULL DEFAULT '',
  prompt TEXT,                              -- last user instruction
  status TEXT NOT NULL DEFAULT 'draft',     -- 'draft' | 'exported'
  exported_attachment_id UUID,              -- ref to deal_attachments after PDF export
  exported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_styled_docs_deal ON public.ai_styled_documents(deal_id);
CREATE INDEX idx_ai_styled_docs_user ON public.ai_styled_documents(user_id);

ALTER TABLE public.ai_styled_documents ENABLE ROW LEVEL SECURITY;

-- Authenticated users with access to the deal can read/write; mirrors deal_attachments style access
CREATE POLICY "Authenticated users can view styled documents"
ON public.ai_styled_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id::text = ai_styled_documents.deal_id::text
  )
);

CREATE POLICY "Users can create their own styled documents"
ON public.ai_styled_documents
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own styled documents"
ON public.ai_styled_documents
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own styled documents"
ON public.ai_styled_documents
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER ai_styled_documents_updated_at
BEFORE UPDATE ON public.ai_styled_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3) Storage bucket for style reference images (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-style-refs', 'ai-style-refs', false)
ON CONFLICT (id) DO NOTHING;

-- Users can manage their own style ref files (path prefix = user.id)
CREATE POLICY "Users can read their style refs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'ai-style-refs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload their style refs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ai-style-refs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their style refs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'ai-style-refs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their style refs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'ai-style-refs' AND auth.uid()::text = (storage.foldername(name))[1]);
