
CREATE TABLE public.insights_agenda_footnotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  agenda_period_type TEXT NOT NULL,
  agenda_period_key TEXT NOT NULL,
  footnote_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NULL,
  source_anchor TEXT NULL,
  source_snapshot_text TEXT NOT NULL DEFAULT '',
  source_current_text TEXT NULL,
  source_updated_at TIMESTAMPTZ NULL,
  link_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT insights_agenda_footnotes_period_type_chk
    CHECK (agenda_period_type IN ('month','quarter')),
  CONSTRAINT insights_agenda_footnotes_period_key_chk
    CHECK (
      (agenda_period_type = 'month'   AND agenda_period_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$') OR
      (agenda_period_type = 'quarter' AND agenda_period_key ~ '^[0-9]{4}-Q[1-4]$')
    ),
  CONSTRAINT insights_agenda_footnotes_type_chk
    CHECK (footnote_type IN ('decision','note','action_item')),
  CONSTRAINT insights_agenda_footnotes_status_chk
    CHECK (status IN ('active','archived'))
);

CREATE INDEX insights_agenda_footnotes_period_idx
  ON public.insights_agenda_footnotes (company_id, agenda_period_type, agenda_period_key);
CREATE INDEX insights_agenda_footnotes_source_idx
  ON public.insights_agenda_footnotes (source_type, source_id);
CREATE UNIQUE INDEX insights_agenda_footnotes_dedup_uidx
  ON public.insights_agenda_footnotes (company_id, agenda_period_type, agenda_period_key, source_type, source_id, source_anchor)
  WHERE source_id IS NOT NULL AND status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights_agenda_footnotes TO authenticated;
GRANT ALL ON public.insights_agenda_footnotes TO service_role;

ALTER TABLE public.insights_agenda_footnotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members select agenda footnotes"
  ON public.insights_agenda_footnotes FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members insert agenda footnotes"
  ON public.insights_agenda_footnotes FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members update agenda footnotes"
  ON public.insights_agenda_footnotes FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members delete agenda footnotes"
  ON public.insights_agenda_footnotes FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE OR REPLACE FUNCTION public.touch_insights_agenda_footnotes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_insights_agenda_footnotes_touch
BEFORE UPDATE ON public.insights_agenda_footnotes
FOR EACH ROW EXECUTE FUNCTION public.touch_insights_agenda_footnotes_updated_at();


CREATE TABLE public.insights_agenda_footnote_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  footnote_id UUID NOT NULL REFERENCES public.insights_agenda_footnotes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX insights_agenda_footnote_refs_fn_idx
  ON public.insights_agenda_footnote_refs (footnote_id);
CREATE INDEX insights_agenda_footnote_refs_company_idx
  ON public.insights_agenda_footnote_refs (company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights_agenda_footnote_refs TO authenticated;
GRANT ALL ON public.insights_agenda_footnote_refs TO service_role;

ALTER TABLE public.insights_agenda_footnote_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members select agenda footnote refs"
  ON public.insights_agenda_footnote_refs FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members insert agenda footnote refs"
  ON public.insights_agenda_footnote_refs FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members delete agenda footnote refs"
  ON public.insights_agenda_footnote_refs FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
