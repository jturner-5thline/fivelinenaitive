
-- Contact attachments table
CREATE TABLE public.crm_contact_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contact_attachments TO authenticated;
GRANT ALL ON public.crm_contact_attachments TO service_role;

ALTER TABLE public.crm_contact_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own contact attachments"
  ON public.crm_contact_attachments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own contact attachments"
  ON public.crm_contact_attachments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own contact attachments"
  ON public.crm_contact_attachments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own contact attachments"
  ON public.crm_contact_attachments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_crm_contact_attachments_contact ON public.crm_contact_attachments(contact_id);
CREATE INDEX idx_crm_contact_attachments_user ON public.crm_contact_attachments(user_id);

CREATE TRIGGER trg_crm_contact_attachments_updated
  BEFORE UPDATE ON public.crm_contact_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage RLS on the private bucket. Files are keyed by "{user_id}/{contact_id}/{file}".
CREATE POLICY "Users read own contact attachment files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'crm-contact-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users upload own contact attachment files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'crm-contact-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own contact attachment files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'crm-contact-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
