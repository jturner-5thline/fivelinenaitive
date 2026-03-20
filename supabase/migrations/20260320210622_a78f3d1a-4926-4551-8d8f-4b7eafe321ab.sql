
-- VDR Documents table (file metadata, folders represented as rows with is_folder)
CREATE TABLE public.vdr_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id),
  filename TEXT NOT NULL,
  file_path TEXT, -- Supabase Storage path (null for folders)
  file_size BIGINT DEFAULT 0,
  file_type TEXT, -- mime type or extension
  folder_path TEXT NOT NULL DEFAULT '/', -- parent folder path e.g. '/1.0 Corporate/'
  is_folder BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'dataroom' CHECK (source IN ('dataroom', 'incoming', 'team_comms')),
  uploaded_by UUID REFERENCES auth.users(id),
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VDR IRL Requests
CREATE TABLE public.vdr_irl_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id),
  request_number TEXT,
  request_name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'addressed', 'pending_review')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- VDR Tasks
CREATE TABLE public.vdr_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id),
  task_name TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'custom' CHECK (task_type IN ('tie_out', 'compliance_review', 'financial_analysis', 'legal_review', 'tax_analysis', 'custom')),
  description TEXT,
  instructions TEXT,
  assignee UUID REFERENCES auth.users(id),
  hours_allocated NUMERIC(10,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'complete')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Task ↔ IRL Request links
CREATE TABLE public.vdr_task_request_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.vdr_tasks(id) ON DELETE CASCADE,
  irl_request_id UUID NOT NULL REFERENCES public.vdr_irl_requests(id) ON DELETE CASCADE,
  UNIQUE(task_id, irl_request_id)
);

-- Task ↔ Document links
CREATE TABLE public.vdr_task_document_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.vdr_tasks(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.vdr_documents(id) ON DELETE CASCADE,
  UNIQUE(task_id, document_id)
);

-- Enable RLS on all tables
ALTER TABLE public.vdr_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vdr_irl_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vdr_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vdr_task_request_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vdr_task_document_links ENABLE ROW LEVEL SECURITY;

-- RLS policies: company-scoped access
CREATE POLICY "Company members can view vdr_documents"
  ON public.vdr_documents FOR SELECT TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "Company members can insert vdr_documents"
  ON public.vdr_documents FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "Company members can update vdr_documents"
  ON public.vdr_documents FOR UPDATE TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "Company members can delete vdr_documents"
  ON public.vdr_documents FOR DELETE TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "Company members can view vdr_irl_requests"
  ON public.vdr_irl_requests FOR SELECT TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "Company members can insert vdr_irl_requests"
  ON public.vdr_irl_requests FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "Company members can update vdr_irl_requests"
  ON public.vdr_irl_requests FOR UPDATE TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "Company members can delete vdr_irl_requests"
  ON public.vdr_irl_requests FOR DELETE TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "Company members can view vdr_tasks"
  ON public.vdr_tasks FOR SELECT TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "Company members can insert vdr_tasks"
  ON public.vdr_tasks FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "Company members can update vdr_tasks"
  ON public.vdr_tasks FOR UPDATE TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

CREATE POLICY "Company members can delete vdr_tasks"
  ON public.vdr_tasks FOR DELETE TO authenticated
  USING (company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid()))));

-- Link tables: access through parent task
CREATE POLICY "Access vdr_task_request_links via task"
  ON public.vdr_task_request_links FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vdr_tasks t WHERE t.id = task_id AND t.company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid())))));

CREATE POLICY "Access vdr_task_document_links via task"
  ON public.vdr_task_document_links FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vdr_tasks t WHERE t.id = task_id AND t.company_id IN (SELECT unnest(public.get_user_company_ids(auth.uid())))));

-- Storage bucket for VDR files
INSERT INTO storage.buckets (id, name, public) VALUES ('vdr-files', 'vdr-files', false);

-- Storage RLS: company members can manage files scoped to their deals
CREATE POLICY "VDR files upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vdr-files');

CREATE POLICY "VDR files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vdr-files');

CREATE POLICY "VDR files update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vdr-files');

CREATE POLICY "VDR files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vdr-files');

-- Indexes for performance
CREATE INDEX idx_vdr_documents_deal_id ON public.vdr_documents(deal_id);
CREATE INDEX idx_vdr_documents_folder_path ON public.vdr_documents(deal_id, folder_path);
CREATE INDEX idx_vdr_irl_requests_deal_id ON public.vdr_irl_requests(deal_id);
CREATE INDEX idx_vdr_tasks_deal_id ON public.vdr_tasks(deal_id);
