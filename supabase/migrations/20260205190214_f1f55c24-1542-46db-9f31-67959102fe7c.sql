-- Create table for outstanding item comments
CREATE TABLE public.outstanding_item_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.outstanding_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_display_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add ETA field to outstanding_items (notes already exists)
ALTER TABLE public.outstanding_items
ADD COLUMN IF NOT EXISTS eta DATE;

-- Enable RLS
ALTER TABLE public.outstanding_item_comments ENABLE ROW LEVEL SECURITY;

-- RLS policies for comments (same company members can view/add)
CREATE POLICY "Company members can view item comments"
ON public.outstanding_item_comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.outstanding_items oi
    JOIN public.deals d ON d.id = oi.deal_id
    WHERE oi.id = outstanding_item_comments.item_id
    AND public.is_company_member(auth.uid(), d.company_id)
  )
);

CREATE POLICY "Company members can add item comments"
ON public.outstanding_item_comments
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.outstanding_items oi
    JOIN public.deals d ON d.id = oi.deal_id
    WHERE oi.id = outstanding_item_comments.item_id
    AND public.is_company_member(auth.uid(), d.company_id)
  )
);

CREATE POLICY "Users can delete own comments"
ON public.outstanding_item_comments
FOR DELETE
USING (auth.uid() = user_id);

-- Index for performance
CREATE INDEX idx_outstanding_item_comments_item_id ON public.outstanding_item_comments(item_id);
CREATE INDEX idx_outstanding_item_comments_created_at ON public.outstanding_item_comments(created_at DESC);