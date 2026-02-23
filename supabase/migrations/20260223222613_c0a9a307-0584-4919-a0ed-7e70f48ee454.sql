
-- Add lender_id column to tasks table to associate tasks with specific lenders
ALTER TABLE public.tasks ADD COLUMN lender_id UUID REFERENCES public.deal_lenders(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX idx_tasks_lender_id ON public.tasks(lender_id) WHERE lender_id IS NOT NULL;
