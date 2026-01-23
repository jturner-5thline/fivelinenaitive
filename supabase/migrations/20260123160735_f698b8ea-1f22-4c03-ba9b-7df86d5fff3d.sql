-- Add icon and color columns to checklist categories
ALTER TABLE public.data_room_checklist_categories
ADD COLUMN icon TEXT DEFAULT 'folder',
ADD COLUMN color TEXT DEFAULT 'gray';