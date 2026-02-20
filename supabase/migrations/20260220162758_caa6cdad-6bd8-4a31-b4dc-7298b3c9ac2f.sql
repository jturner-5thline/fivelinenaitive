
-- Add company_id to workflows
ALTER TABLE public.workflows ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- Populate company_id for existing workflows based on user's company
UPDATE public.workflows w
SET company_id = cm.company_id
FROM public.company_members cm
WHERE cm.user_id = w.user_id;

-- Drop the old SELECT policies
DROP POLICY "Require authentication for workflows" ON public.workflows;
DROP POLICY "Users can view their own workflows" ON public.workflows;

-- New SELECT policy: owner OR company admin
CREATE POLICY "Users can view own or company admin workflows"
ON public.workflows FOR SELECT
USING (
  auth.uid() = user_id
  OR public.is_company_admin(auth.uid(), company_id)
);
