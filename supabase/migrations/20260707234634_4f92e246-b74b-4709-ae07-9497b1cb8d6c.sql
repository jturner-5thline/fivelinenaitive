ALTER TABLE public.admin_agent_knowledge_docs
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.admin_agent_knowledge_docs
  DROP CONSTRAINT IF EXISTS admin_agent_knowledge_docs_tags_check;
ALTER TABLE public.admin_agent_knowledge_docs
  ADD CONSTRAINT admin_agent_knowledge_docs_tags_check
  CHECK (tags <@ ARRAY['rules','requirements','definitions','glossary','workflow','other']::text[]);

CREATE INDEX IF NOT EXISTS admin_agent_knowledge_docs_tags_idx
  ON public.admin_agent_knowledge_docs USING GIN (tags);

ALTER TABLE public.admin_agent_settings
  ADD COLUMN IF NOT EXISTS knowledge_tag_filter text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.admin_agent_settings
  DROP CONSTRAINT IF EXISTS admin_agent_settings_knowledge_tag_filter_check;
ALTER TABLE public.admin_agent_settings
  ADD CONSTRAINT admin_agent_settings_knowledge_tag_filter_check
  CHECK (knowledge_tag_filter <@ ARRAY['rules','requirements','definitions','glossary','workflow','other']::text[]);