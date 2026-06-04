
ALTER TABLE public.qir_comments
  ADD COLUMN IF NOT EXISTS comment_type text NOT NULL DEFAULT 'note';
ALTER TABLE public.qir_comments
  DROP CONSTRAINT IF EXISTS qir_comments_comment_type_chk;
ALTER TABLE public.qir_comments
  ADD CONSTRAINT qir_comments_comment_type_chk
  CHECK (comment_type IN ('note','decision','action_item'));

ALTER TABLE public.agenda_comments
  ADD COLUMN IF NOT EXISTS comment_type text NOT NULL DEFAULT 'note';
ALTER TABLE public.agenda_comments
  DROP CONSTRAINT IF EXISTS agenda_comments_comment_type_chk;
ALTER TABLE public.agenda_comments
  ADD CONSTRAINT agenda_comments_comment_type_chk
  CHECK (comment_type IN ('note','decision','action_item'));
