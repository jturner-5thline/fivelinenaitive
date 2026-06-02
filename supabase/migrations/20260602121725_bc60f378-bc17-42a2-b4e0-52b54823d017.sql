
-- 1. Add is_qa flag for hidden QA pipelines
ALTER TABLE public.deal_pipelines
  ADD COLUMN IF NOT EXISTS is_qa boolean NOT NULL DEFAULT false;

-- 2. Insert the QA pipeline (idempotent) scoped to 5th Line internal workspace
INSERT INTO public.deal_pipelines (company_id, name, stages, is_default, position, is_qa)
SELECT '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid,
       '__qa_copilot__',
       '[{"id":"qa-stage","label":"QA","color":"#888"}]'::jsonb,
       false,
       9999,
       true
WHERE NOT EXISTS (
  SELECT 1 FROM public.deal_pipelines
  WHERE name = '__qa_copilot__' AND company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid
);

-- 3. Admin one-time links storage
CREATE TABLE IF NOT EXISTS public.admin_one_time_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  tenant_name text,
  admin_user_id uuid,
  admin_email text,
  magic_link text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_one_time_links TO authenticated;
GRANT ALL ON public.admin_one_time_links TO service_role;

ALTER TABLE public.admin_one_time_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform admins read admin_one_time_links" ON public.admin_one_time_links;
CREATE POLICY "platform admins read admin_one_time_links"
ON public.admin_one_time_links
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "platform admins insert admin_one_time_links" ON public.admin_one_time_links;
CREATE POLICY "platform admins insert admin_one_time_links"
ON public.admin_one_time_links
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "platform admins update admin_one_time_links" ON public.admin_one_time_links;
CREATE POLICY "platform admins update admin_one_time_links"
ON public.admin_one_time_links
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()));
