
-- 1. Data Room Comments (per-item threaded comments)
CREATE TABLE public.data_room_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  checklist_item_id TEXT NOT NULL,
  parent_comment_id UUID REFERENCES public.data_room_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.data_room_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments for deals they can access" ON public.data_room_comments
  FOR SELECT USING (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Authenticated users can create comments on accessible deals" ON public.data_room_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Users can update their own comments" ON public.data_room_comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments" ON public.data_room_comments
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_data_room_comments_updated_at BEFORE UPDATE ON public.data_room_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_data_room_comments_deal ON public.data_room_comments(deal_id);
CREATE INDEX idx_data_room_comments_item ON public.data_room_comments(checklist_item_id);

-- 2. Data Room Audit Log
CREATE TABLE public.data_room_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_display_name TEXT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  target_name TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.data_room_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit logs for deals they can access" ON public.data_room_audit_log
  FOR SELECT USING (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Authenticated users can create audit log entries" ON public.data_room_audit_log
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.can_access_deal(auth.uid(), deal_id));

CREATE INDEX idx_data_room_audit_deal ON public.data_room_audit_log(deal_id);
CREATE INDEX idx_data_room_audit_created ON public.data_room_audit_log(created_at DESC);

-- 3. Data Room Share Links (external sharing portal)
CREATE TABLE public.data_room_share_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  label TEXT NOT NULL DEFAULT 'External Upload Link',
  target_checklist_items TEXT[] DEFAULT '{}',
  permissions TEXT NOT NULL DEFAULT 'upload_only',
  password_hash TEXT,
  expires_at TIMESTAMPTZ,
  max_uploads INTEGER,
  uploads_used INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.data_room_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view share links for deals they can access" ON public.data_room_share_links
  FOR SELECT USING (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Users can create share links for accessible deals" ON public.data_room_share_links
  FOR INSERT WITH CHECK (auth.uid() = created_by AND public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Users can update their share links" ON public.data_room_share_links
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their share links" ON public.data_room_share_links
  FOR DELETE USING (auth.uid() = created_by);

CREATE TRIGGER update_data_room_share_links_updated_at BEFORE UPDATE ON public.data_room_share_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_data_room_share_links_token ON public.data_room_share_links(token);
CREATE INDEX idx_data_room_share_links_deal ON public.data_room_share_links(deal_id);

-- 4. File Access Permissions
CREATE TABLE public.data_room_file_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES public.deal_attachments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_download BOOLEAN NOT NULL DEFAULT true,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  granted_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(file_id, user_id)
);

ALTER TABLE public.data_room_file_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view file permissions for accessible deals" ON public.data_room_file_permissions
  FOR SELECT USING (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Deal owners/admins can manage file permissions" ON public.data_room_file_permissions
  FOR ALL USING (auth.uid() = granted_by AND public.can_access_deal(auth.uid(), deal_id));

CREATE INDEX idx_file_permissions_file ON public.data_room_file_permissions(file_id);
CREATE INDEX idx_file_permissions_user ON public.data_room_file_permissions(user_id);

-- 5. Add due_date column to both checklist tables
ALTER TABLE public.data_room_checklist_items ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.deal_checklist_items ADD COLUMN IF NOT EXISTS due_date DATE;

-- 6. Enable realtime for comments and audit log
ALTER PUBLICATION supabase_realtime ADD TABLE public.data_room_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.data_room_audit_log;
