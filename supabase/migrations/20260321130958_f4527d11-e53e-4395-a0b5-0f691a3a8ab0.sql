ALTER TABLE public.tasks ADD COLUMN contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_contact_id ON public.tasks(contact_id) WHERE contact_id IS NOT NULL;