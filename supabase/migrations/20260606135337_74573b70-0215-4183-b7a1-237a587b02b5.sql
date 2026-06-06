CREATE TABLE public.calendar_item_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  deal_calendar_item_id UUID NULL REFERENCES public.deal_calendar_items(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  source_module TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  source_timestamp TIMESTAMPTZ NOT NULL,
  source_text TEXT NOT NULL,
  source_deep_link TEXT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calendar_item_sources_exactly_one_target CHECK (
    (task_id IS NOT NULL)::int + (deal_calendar_item_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX idx_calendar_item_sources_task ON public.calendar_item_sources(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_calendar_item_sources_event ON public.calendar_item_sources(deal_calendar_item_id) WHERE deal_calendar_item_id IS NOT NULL;
CREATE INDEX idx_calendar_item_sources_deal ON public.calendar_item_sources(deal_id);
CREATE INDEX idx_calendar_item_sources_source ON public.calendar_item_sources(source_module, source_record_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_item_sources TO authenticated;
GRANT ALL ON public.calendar_item_sources TO service_role;

ALTER TABLE public.calendar_item_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read calendar item sources for accessible deals"
ON public.calendar_item_sources
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = calendar_item_sources.deal_id
      AND (
        d.user_id = auth.uid()
        OR (
          d.company_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = d.company_id AND cm.user_id = auth.uid()
          )
        )
      )
  )
);

CREATE POLICY "Insert calendar item sources for accessible deals"
ON public.calendar_item_sources
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = calendar_item_sources.deal_id
      AND (
        d.user_id = auth.uid()
        OR (
          d.company_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = d.company_id AND cm.user_id = auth.uid()
          )
        )
      )
  )
);

CREATE POLICY "Delete calendar item sources they created"
ON public.calendar_item_sources
FOR DELETE
TO authenticated
USING (created_by = auth.uid());
