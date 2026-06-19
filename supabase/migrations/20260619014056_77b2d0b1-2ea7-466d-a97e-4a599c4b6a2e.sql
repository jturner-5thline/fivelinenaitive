
CREATE TABLE public.crm_company_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_company_id uuid NOT NULL REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  file_path text NOT NULL,
  content_type text,
  size_bytes bigint NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crm_company_attachments_company_idx ON public.crm_company_attachments(crm_company_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_company_attachments TO authenticated;
GRANT ALL ON public.crm_company_attachments TO service_role;

ALTER TABLE public.crm_company_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view crm company attachments"
ON public.crm_company_attachments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.crm_companies c
    WHERE c.id = crm_company_attachments.crm_company_id
      AND (
        is_5thline_user(auth.uid())
        OR c.org_company_id IN (
          SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
        )
      )
  )
);

CREATE POLICY "Org members can insert crm company attachments"
ON public.crm_company_attachments FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.crm_companies c
    WHERE c.id = crm_company_attachments.crm_company_id
      AND (
        is_5thline_user(auth.uid())
        OR c.org_company_id IN (
          SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
        )
      )
  )
);

CREATE POLICY "Org members can delete crm company attachments"
ON public.crm_company_attachments FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.crm_companies c
    WHERE c.id = crm_company_attachments.crm_company_id
      AND (
        is_5thline_user(auth.uid())
        OR c.org_company_id IN (
          SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
        )
      )
  )
);

-- Storage policies for the new bucket
CREATE POLICY "Org members can view crm-company-attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'crm-company-attachments'
  AND EXISTS (
    SELECT 1 FROM public.crm_company_attachments a
    JOIN public.crm_companies c ON c.id = a.crm_company_id
    WHERE a.file_path = storage.objects.name
      AND (
        is_5thline_user(auth.uid())
        OR c.org_company_id IN (
          SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
        )
      )
  )
);

CREATE POLICY "Org members can upload crm-company-attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'crm-company-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owners can delete crm-company-attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'crm-company-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
