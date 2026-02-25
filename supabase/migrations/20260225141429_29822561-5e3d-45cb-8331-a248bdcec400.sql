
-- Create deal memo comments table
CREATE TABLE public.deal_memo_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  memo_id UUID REFERENCES public.deal_memos(id) ON DELETE CASCADE,
  section TEXT NOT NULL, -- 'narrative', 'highlights', 'hurdles', 'lender_notes', 'analyst_notes', 'other_notes'
  item_index INTEGER, -- optional: index of highlight/hurdle being commented on
  content TEXT NOT NULL,
  user_id UUID NOT NULL,
  user_display_name TEXT,
  mentioned_user_ids UUID[] DEFAULT '{}',
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  parent_comment_id UUID REFERENCES public.deal_memo_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deal_memo_comments ENABLE ROW LEVEL SECURITY;

-- RLS: Company members can view comments on deals they can access
CREATE POLICY "Users can view memo comments for accessible deals"
  ON public.deal_memo_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = deal_memo_comments.deal_id
        AND cm.user_id = auth.uid()
    )
  );

-- RLS: Company members can insert comments
CREATE POLICY "Users can create memo comments"
  ON public.deal_memo_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = deal_memo_comments.deal_id
        AND cm.user_id = auth.uid()
    )
  );

-- RLS: Users can update their own comments
CREATE POLICY "Users can update own memo comments"
  ON public.deal_memo_comments FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS: Users can delete their own comments, admins can delete any
CREATE POLICY "Users can delete own memo comments"
  ON public.deal_memo_comments FOR DELETE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Anyone in the company can resolve comments
CREATE POLICY "Company members can resolve memo comments"
  ON public.deal_memo_comments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.company_members cm ON cm.company_id = d.company_id
      WHERE d.id = deal_memo_comments.deal_id
        AND cm.user_id = auth.uid()
    )
  );

-- Add updated_at trigger
CREATE TRIGGER update_deal_memo_comments_updated_at
  BEFORE UPDATE ON public.deal_memo_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_deal_memo_comments_deal_section ON public.deal_memo_comments(deal_id, section);
CREATE INDEX idx_deal_memo_comments_parent ON public.deal_memo_comments(parent_comment_id);
