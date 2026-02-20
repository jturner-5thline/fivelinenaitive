
-- =============================================================
-- Data Room Upgrade: Many-to-many file mapping + Upload Jobs
-- =============================================================

-- 1. Upload Jobs table
CREATE TABLE public.upload_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'single' CHECK (job_type IN ('single', 'multi', 'folder', 'zip')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'completed_with_errors', 'failed')),
  total_files_detected INTEGER NOT NULL DEFAULT 0,
  files_uploaded_successfully INTEGER NOT NULL DEFAULT 0,
  files_failed INTEGER NOT NULL DEFAULT 0,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.upload_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view upload jobs for deals they can access"
  ON public.upload_jobs FOR SELECT
  USING (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Users can create upload jobs for deals they can access"
  ON public.upload_jobs FOR INSERT
  WITH CHECK (public.can_access_deal(auth.uid(), deal_id) AND initiated_by = auth.uid());

CREATE POLICY "Users can update their own upload jobs"
  ON public.upload_jobs FOR UPDATE
  USING (initiated_by = auth.uid());

-- 2. Add upload_job_id and source to deal_attachments
ALTER TABLE public.deal_attachments
  ADD COLUMN IF NOT EXISTS upload_job_id UUID REFERENCES public.upload_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'single_upload' CHECK (source IN ('single_upload', 'bulk_upload', 'folder_upload', 'zip_upload'));

-- 3. File-to-Checklist many-to-many join table
CREATE TABLE public.file_checklist_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES public.deal_attachments(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  mapped_by UUID NOT NULL,
  mapped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  mapping_source TEXT NOT NULL DEFAULT 'manual_picker' CHECK (mapping_source IN ('auto_suggest', 'manual_drag', 'manual_picker')),
  UNIQUE(file_id, checklist_item_id)
);

CREATE INDEX idx_file_checklist_map_file ON public.file_checklist_map(file_id);
CREATE INDEX idx_file_checklist_map_item ON public.file_checklist_map(checklist_item_id);
CREATE INDEX idx_file_checklist_map_deal ON public.file_checklist_map(deal_id);

ALTER TABLE public.file_checklist_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view file mappings for deals they can access"
  ON public.file_checklist_map FOR SELECT
  USING (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Users can create file mappings for deals they can access"
  ON public.file_checklist_map FOR INSERT
  WITH CHECK (public.can_access_deal(auth.uid(), deal_id) AND mapped_by = auth.uid());

CREATE POLICY "Users can delete file mappings for deals they can access"
  ON public.file_checklist_map FOR DELETE
  USING (public.can_access_deal(auth.uid(), deal_id));

-- 4. Migrate existing attachment links from deal_checklist_status to file_checklist_map
INSERT INTO public.file_checklist_map (file_id, checklist_item_id, deal_id, mapped_by, mapping_source)
SELECT 
  dcs.attachment_id,
  COALESCE(dcs.checklist_item_id, dcs.deal_checklist_item_id),
  dcs.deal_id,
  COALESCE(dcs.completed_by, '00000000-0000-0000-0000-000000000000'::uuid),
  'manual_picker'
FROM public.deal_checklist_status dcs
WHERE dcs.attachment_id IS NOT NULL
  AND COALESCE(dcs.checklist_item_id, dcs.deal_checklist_item_id) IS NOT NULL
ON CONFLICT (file_id, checklist_item_id) DO NOTHING;
