ALTER TABLE public.data_room_checklist_categories
  DROP CONSTRAINT data_room_checklist_categories_user_id_fkey,
  ADD CONSTRAINT data_room_checklist_categories_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;