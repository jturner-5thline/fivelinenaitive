ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);
UPDATE public.tasks SET created_by = assigned_by WHERE created_by IS NULL AND assigned_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);
NOTIFY pgrst, 'reload schema';