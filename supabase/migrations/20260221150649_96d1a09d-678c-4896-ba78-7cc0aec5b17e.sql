-- Drop old constraint and add expanded one that includes all frontend status values
ALTER TABLE public.tasks DROP CONSTRAINT tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check CHECK (status = ANY (ARRAY['pending'::text, 'not_started'::text, 'in_progress'::text, 'blocked'::text, 'complete'::text, 'completed'::text]));

-- Migrate existing 'pending' tasks to 'not_started' for consistency with frontend
UPDATE public.tasks SET status = 'not_started' WHERE status = 'pending';

-- Update default to match frontend convention
ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'not_started';