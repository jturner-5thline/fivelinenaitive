
CREATE TABLE public.admin_agent_knowledge_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  agent_key TEXT NOT NULL DEFAULT 'admin_agent',
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('file','text')),
  storage_path TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  extracted_text TEXT,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('pending','ready','error')),
  error_message TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_agent_knowledge_docs_company_agent_idx
  ON public.admin_agent_knowledge_docs (company_id, agent_key, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_agent_knowledge_docs TO authenticated;
GRANT ALL ON public.admin_agent_knowledge_docs TO service_role;

ALTER TABLE public.admin_agent_knowledge_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view knowledge docs for their company"
  ON public.admin_agent_knowledge_docs
  FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert knowledge docs for their company"
  ON public.admin_agent_knowledge_docs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Members can update knowledge docs for their company"
  ON public.admin_agent_knowledge_docs
  FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete knowledge docs for their company"
  ON public.admin_agent_knowledge_docs
  FOR DELETE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- Storage policies for the private admin-agent-knowledge bucket.
-- Path convention: {company_id}/{uuid}-{filename}
CREATE POLICY "Members can read agent knowledge files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'admin-agent-knowledge'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can upload agent knowledge files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'admin-agent-knowledge'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete agent knowledge files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'admin-agent-knowledge'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE TRIGGER update_admin_agent_knowledge_docs_updated_at
  BEFORE UPDATE ON public.admin_agent_knowledge_docs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
