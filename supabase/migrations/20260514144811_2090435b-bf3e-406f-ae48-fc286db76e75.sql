ALTER TABLE public.deal_space_note_comments
ADD COLUMN IF NOT EXISTS parent_comment_id UUID REFERENCES public.deal_space_note_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_deal_space_note_comments_parent
ON public.deal_space_note_comments(parent_comment_id);

CREATE INDEX IF NOT EXISTS idx_deal_space_note_comments_note
ON public.deal_space_note_comments(note_id);