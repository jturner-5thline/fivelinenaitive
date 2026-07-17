-- Enable realtime broadcasts for insights_metric_targets so the Master Plan
-- dialog can refresh live when concurrent edits land.
-- Guarded: adding a table that's already in the publication would error.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'insights_metric_targets'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.insights_metric_targets';
  END IF;
END $$;

-- Ensure full row payloads are delivered so we can diff cell values on updates.
ALTER TABLE public.insights_metric_targets REPLICA IDENTITY FULL;