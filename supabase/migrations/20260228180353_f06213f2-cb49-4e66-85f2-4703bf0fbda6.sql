-- Create report comments table for team collaboration
CREATE TABLE public.diligence_report_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  content TEXT NOT NULL,
  user_id UUID NOT NULL,
  user_display_name TEXT,
  parent_comment_id UUID REFERENCES public.diligence_report_comments(id) ON DELETE CASCADE,
  mentioned_user_ids TEXT[],
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.diligence_report_comments ENABLE ROW LEVEL SECURITY;

-- Policies: users in same company can view and create
CREATE POLICY "Users can view report comments for accessible deals"
ON public.diligence_report_comments FOR SELECT
USING (public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Users can create report comments"
ON public.diligence_report_comments FOR INSERT
WITH CHECK (auth.uid() = user_id AND public.can_access_deal(auth.uid(), deal_id));

CREATE POLICY "Users can update own comments"
ON public.diligence_report_comments FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
ON public.diligence_report_comments FOR DELETE
USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE TRIGGER update_diligence_report_comments_updated_at
BEFORE UPDATE ON public.diligence_report_comments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();