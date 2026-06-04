ALTER PUBLICATION supabase_realtime ADD TABLE public.insights_agenda;
ALTER TABLE public.insights_agenda REPLICA IDENTITY FULL;