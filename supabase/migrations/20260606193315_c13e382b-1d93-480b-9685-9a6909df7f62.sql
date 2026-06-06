ALTER TABLE public.qir_comments
  ADD COLUMN IF NOT EXISTS section_label text,
  ADD COLUMN IF NOT EXISTS snippet_text text;