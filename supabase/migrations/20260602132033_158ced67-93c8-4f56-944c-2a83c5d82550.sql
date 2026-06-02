
-- Agenda comment threads and comments (Google Docs-style commenting on Insights Agenda).
CREATE TABLE public.agenda_comment_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id uuid NOT NULL REFERENCES public.insights_agenda(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  created_by uuid NOT NULL,
  anchor_text text,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_comment_threads TO authenticated;
GRANT ALL ON public.agenda_comment_threads TO service_role;

ALTER TABLE public.agenda_comment_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view agenda threads"
  ON public.agenda_comment_threads FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can create agenda threads"
  ON public.agenda_comment_threads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can update agenda threads"
  ON public.agenda_comment_threads FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can delete agenda threads"
  ON public.agenda_comment_threads FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id) AND auth.uid() = created_by);

CREATE INDEX idx_agenda_threads_agenda ON public.agenda_comment_threads(agenda_id);
CREATE INDEX idx_agenda_threads_company ON public.agenda_comment_threads(company_id);

CREATE TABLE public.agenda_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.agenda_comment_threads(id) ON DELETE CASCADE,
  parent_comment_id uuid REFERENCES public.agenda_comments(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  author_id uuid NOT NULL,
  body text NOT NULL,
  mentions uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_comments TO authenticated;
GRANT ALL ON public.agenda_comments TO service_role;

ALTER TABLE public.agenda_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view agenda comments"
  ON public.agenda_comments FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can create agenda comments"
  ON public.agenda_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND public.is_company_member(auth.uid(), company_id));

-- Edits limited to the author (soft-delete also goes through UPDATE).
CREATE POLICY "Authors can update their agenda comments"
  ON public.agenda_comments FOR UPDATE TO authenticated
  USING (auth.uid() = author_id AND public.is_company_member(auth.uid(), company_id))
  WITH CHECK (auth.uid() = author_id AND public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Authors can delete their agenda comments"
  ON public.agenda_comments FOR DELETE TO authenticated
  USING (auth.uid() = author_id AND public.is_company_member(auth.uid(), company_id));

CREATE INDEX idx_agenda_comments_thread ON public.agenda_comments(thread_id, created_at);
CREATE INDEX idx_agenda_comments_company ON public.agenda_comments(company_id);

-- updated_at triggers (reuse standard helper)
CREATE TRIGGER trg_agenda_threads_updated_at
  BEFORE UPDATE ON public.agenda_comment_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_agenda_comments_updated_at
  BEFORE UPDATE ON public.agenda_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_comment_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agenda_comments;
