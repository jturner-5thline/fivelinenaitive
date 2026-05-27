
CREATE TYPE public.deal_calendar_item_type AS ENUM ('meeting', 'deadline', 'reminder', 'note');

CREATE TABLE public.deal_calendar_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME NULL,
  notes TEXT NULL,
  type public.deal_calendar_item_type NOT NULL DEFAULT 'meeting',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_calendar_items_deal_date ON public.deal_calendar_items(deal_id, date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_calendar_items TO authenticated;
GRANT ALL ON public.deal_calendar_items TO service_role;

ALTER TABLE public.deal_calendar_items ENABLE ROW LEVEL SECURITY;

-- Users can read calendar items for any deal in a company they belong to,
-- or deals they own.
CREATE POLICY "Read deal calendar items for accessible deals"
ON public.deal_calendar_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_calendar_items.deal_id
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

CREATE POLICY "Insert deal calendar items for accessible deals"
ON public.deal_calendar_items
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_calendar_items.deal_id
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

CREATE POLICY "Update deal calendar items for accessible deals"
ON public.deal_calendar_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_calendar_items.deal_id
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

CREATE POLICY "Delete deal calendar items for accessible deals"
ON public.deal_calendar_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.deals d
    WHERE d.id = deal_calendar_items.deal_id
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

CREATE TRIGGER update_deal_calendar_items_updated_at
BEFORE UPDATE ON public.deal_calendar_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_calendar_items;
