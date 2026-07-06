DROP POLICY IF EXISTS "Company admins can insert grid layouts" ON public.dashboard_grid_layouts;
DROP POLICY IF EXISTS "Company admins can update grid layouts" ON public.dashboard_grid_layouts;
DROP POLICY IF EXISTS "Company admins can delete grid layouts" ON public.dashboard_grid_layouts;

CREATE POLICY "Company admins can insert grid layouts"
ON public.dashboard_grid_layouts
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_company_admin(auth.uid(), company_id)
  AND (
    dashboard_id <> 'insights-management-review-v20'
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'jturner@5thline.co'
  )
);

CREATE POLICY "Company admins can update grid layouts"
ON public.dashboard_grid_layouts
FOR UPDATE
TO authenticated
USING (
  public.is_company_admin(auth.uid(), company_id)
  AND (
    dashboard_id <> 'insights-management-review-v20'
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'jturner@5thline.co'
  )
)
WITH CHECK (
  public.is_company_admin(auth.uid(), company_id)
  AND (
    dashboard_id <> 'insights-management-review-v20'
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'jturner@5thline.co'
  )
);

CREATE POLICY "Company admins can delete grid layouts"
ON public.dashboard_grid_layouts
FOR DELETE
TO authenticated
USING (
  public.is_company_admin(auth.uid(), company_id)
  AND (
    dashboard_id <> 'insights-management-review-v20'
    OR lower(coalesce(auth.jwt() ->> 'email', '')) = 'jturner@5thline.co'
  )
);