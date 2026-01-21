-- Add user profile info to activity_logs for better audit trail
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'activity_logs' AND column_name = 'user_display_name'
  ) THEN
    ALTER TABLE public.activity_logs ADD COLUMN user_display_name TEXT;
  END IF;
END $$;

-- Enable realtime for activity_logs
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'activity_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
  END IF;
END $$;