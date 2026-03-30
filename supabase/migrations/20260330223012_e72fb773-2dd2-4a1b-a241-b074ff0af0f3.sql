
-- Add crm_company_id column to tasks table
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS crm_company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL;

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_tasks_crm_company_id ON public.tasks(crm_company_id) WHERE crm_company_id IS NOT NULL;
