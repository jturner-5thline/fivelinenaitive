
-- Add trigger to auto-set company_id from user_id on insert if not provided
CREATE TRIGGER set_company_id_on_checklist_item
  BEFORE INSERT ON public.data_room_checklist_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_company_id_from_user();
