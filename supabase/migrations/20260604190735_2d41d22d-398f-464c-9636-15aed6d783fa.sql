ALTER TABLE public.qir_comments
  ADD COLUMN IF NOT EXISTS period_type text,
  ADD COLUMN IF NOT EXISTS period_key text;

ALTER TABLE public.agenda_comments
  ADD COLUMN IF NOT EXISTS period_type text,
  ADD COLUMN IF NOT EXISTS period_key text;

CREATE INDEX IF NOT EXISTS idx_qir_comments_author_period
  ON public.qir_comments (company_id, author_user_id, period_key);

CREATE INDEX IF NOT EXISTS idx_agenda_comments_author_period
  ON public.agenda_comments (company_id, author_id, period_key);