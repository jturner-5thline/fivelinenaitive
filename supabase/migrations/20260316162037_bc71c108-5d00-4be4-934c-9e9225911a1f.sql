
-- 1. Add company_id to dashboard_layouts
ALTER TABLE public.dashboard_layouts ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill company_id from user's company membership
UPDATE public.dashboard_layouts dl
SET company_id = (
  SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = dl.user_id LIMIT 1
);

-- Add index
CREATE INDEX idx_dashboard_layouts_company_id ON public.dashboard_layouts (company_id);

-- Drop old user-based RLS policies
DROP POLICY IF EXISTS "Users can create their own dashboard layouts" ON public.dashboard_layouts;
DROP POLICY IF EXISTS "Users can delete their own dashboard layouts" ON public.dashboard_layouts;
DROP POLICY IF EXISTS "Users can update their own dashboard layouts" ON public.dashboard_layouts;
DROP POLICY IF EXISTS "Users can view their own dashboard layouts" ON public.dashboard_layouts;

-- New RLS: company members can read, admins can write
CREATE POLICY "Company members can view dashboard layouts"
ON public.dashboard_layouts FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company admins can insert dashboard layouts"
ON public.dashboard_layouts FOR INSERT TO authenticated
WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can update dashboard layouts"
ON public.dashboard_layouts FOR UPDATE TO authenticated
USING (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can delete dashboard layouts"
ON public.dashboard_layouts FOR DELETE TO authenticated
USING (public.is_company_admin(auth.uid(), company_id));

-- 2. Add company_id to dashboard_grid_layouts
ALTER TABLE public.dashboard_grid_layouts ADD COLUMN company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill
UPDATE public.dashboard_grid_layouts dgl
SET company_id = (
  SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = dgl.user_id LIMIT 1
);

-- Drop old unique constraint and create new one
ALTER TABLE public.dashboard_grid_layouts DROP CONSTRAINT IF EXISTS dashboard_grid_layouts_user_id_dashboard_id_key;
CREATE UNIQUE INDEX dashboard_grid_layouts_company_dashboard_key ON public.dashboard_grid_layouts (company_id, dashboard_id);

CREATE INDEX idx_dashboard_grid_layouts_company_id ON public.dashboard_grid_layouts (company_id);

-- Drop old RLS
DROP POLICY IF EXISTS "Users can manage their own layouts" ON public.dashboard_grid_layouts;

-- New RLS
CREATE POLICY "Company members can view grid layouts"
ON public.dashboard_grid_layouts FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Company admins can insert grid layouts"
ON public.dashboard_grid_layouts FOR INSERT TO authenticated
WITH CHECK (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can update grid layouts"
ON public.dashboard_grid_layouts FOR UPDATE TO authenticated
USING (public.is_company_admin(auth.uid(), company_id));

CREATE POLICY "Company admins can delete grid layouts"
ON public.dashboard_grid_layouts FOR DELETE TO authenticated
USING (public.is_company_admin(auth.uid(), company_id));
