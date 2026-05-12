
CREATE TABLE IF NOT EXISTS public.naitive_pipeline_agenda_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  period_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  completed BOOLEAN NOT NULL DEFAULT false,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_naitive_agenda_period
  ON public.naitive_pipeline_agenda_items (company_id, period_type, period_key, sort_index);

ALTER TABLE public.naitive_pipeline_agenda_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read agenda items"
  ON public.naitive_pipeline_agenda_items
  FOR SELECT
  USING (company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE POLICY "Members can insert agenda items"
  ON public.naitive_pipeline_agenda_items
  FOR INSERT
  WITH CHECK (company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE POLICY "Members can update agenda items"
  ON public.naitive_pipeline_agenda_items
  FOR UPDATE
  USING (company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE POLICY "Members can delete agenda items"
  ON public.naitive_pipeline_agenda_items
  FOR DELETE
  USING (company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE TRIGGER trg_naitive_agenda_items_updated
  BEFORE UPDATE ON public.naitive_pipeline_agenda_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
