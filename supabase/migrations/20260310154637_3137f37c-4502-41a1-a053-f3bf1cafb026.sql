-- Enable realtime for data room tables that are missing from the publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.file_checklist_map;