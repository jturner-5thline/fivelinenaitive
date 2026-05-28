-- Broaden deal_calendar_items access via shared can_access_deal helper.
DROP POLICY IF EXISTS "Read deal calendar items for accessible deals"   ON public.deal_calendar_items;
DROP POLICY IF EXISTS "Insert deal calendar items for accessible deals" ON public.deal_calendar_items;
DROP POLICY IF EXISTS "Update deal calendar items for accessible deals" ON public.deal_calendar_items;
DROP POLICY IF EXISTS "Delete deal calendar items for accessible deals" ON public.deal_calendar_items;

CREATE POLICY "Read deal calendar items for accessible deals"
ON public.deal_calendar_items
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR public.can_access_deal(auth.uid(), deal_id)
);

CREATE POLICY "Insert deal calendar items for accessible deals"
ON public.deal_calendar_items
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND public.can_access_deal(auth.uid(), deal_id)
);

CREATE POLICY "Update deal calendar items for accessible deals"
ON public.deal_calendar_items
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR public.can_access_deal(auth.uid(), deal_id)
);

CREATE POLICY "Delete deal calendar items for accessible deals"
ON public.deal_calendar_items
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  OR public.can_access_deal(auth.uid(), deal_id)
);

-- Ensure realtime publication includes the table (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'deal_calendar_items'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_calendar_items';
  END IF;
END $$;

ALTER TABLE public.deal_calendar_items REPLICA IDENTITY FULL;