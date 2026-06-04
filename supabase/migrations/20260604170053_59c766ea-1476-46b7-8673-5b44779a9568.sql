-- Report → Agenda comment queue
-- A lightweight staging table that lets users promote any report comment
-- (Agenda or QIR) into the Agenda's footnote/reference system.

CREATE TABLE public.report_agenda_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('month','quarter')),
  period_key text NOT NULL,
  report_tab text,                          -- 'JT' | 'JM' | 'SW' | NULL (non-report surfaces)
  source_type text NOT NULL CHECK (source_type IN (
    'selected_text','narrative','kpi','chart','goal','initiative','risk','section'
  )),
  source_id text,
  source_anchor text,
  source_snapshot_text text,
  source_label text,
  comment_source text NOT NULL CHECK (comment_source IN ('qir','agenda')),
  comment_id uuid,                          -- soft ref into qir_comments or agenda_comments
  comment_text_snapshot text NOT NULL,
  created_by uuid NOT NULL,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  queue_status text NOT NULL DEFAULT 'queued'
    CHECK (queue_status IN ('queued','added_to_agenda','dismissed','archived')),
  agenda_insertion_mode text
    CHECK (agenda_insertion_mode IN ('body_reference','free_text','footnote_only')),
  linked_footnote_id uuid REFERENCES public.insights_agenda_footnotes(id) ON DELETE SET NULL,
  linked_ref_id text
);

-- Dedup: one queue row per comment instance
CREATE UNIQUE INDEX report_agenda_queue_comment_dedup
  ON public.report_agenda_queue (company_id, comment_source, comment_id)
  WHERE comment_id IS NOT NULL;

CREATE INDEX report_agenda_queue_scope_idx
  ON public.report_agenda_queue (company_id, period_type, period_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_agenda_queue TO authenticated;
GRANT ALL ON public.report_agenda_queue TO service_role;

ALTER TABLE public.report_agenda_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read queue"
  ON public.report_agenda_queue FOR SELECT
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can insert queue"
  ON public.report_agenda_queue FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_company_member(auth.uid(), company_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "Company members can update queue"
  ON public.report_agenda_queue FOR UPDATE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company members can delete queue"
  ON public.report_agenda_queue FOR DELETE
  TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- updated_at trigger
CREATE TRIGGER report_agenda_queue_updated_at
  BEFORE UPDATE ON public.report_agenda_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.report_agenda_queue;