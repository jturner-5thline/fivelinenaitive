-- Enable realtime for the template checklist items table so admin changes propagate
ALTER PUBLICATION supabase_realtime ADD TABLE public.data_room_checklist_items;