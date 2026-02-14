
-- Drop existing mutation policies for data_room_checklist_items
DROP POLICY "Company members can create checklist items" ON public.data_room_checklist_items;
DROP POLICY "Company members can update checklist items" ON public.data_room_checklist_items;
DROP POLICY "Company members can delete checklist items" ON public.data_room_checklist_items;

-- Drop existing mutation policies for data_room_checklist_categories
DROP POLICY "Company members can create categories" ON public.data_room_checklist_categories;
DROP POLICY "Company members can update categories" ON public.data_room_checklist_categories;
DROP POLICY "Company members can delete categories" ON public.data_room_checklist_categories;

-- Recreate mutation policies restricted to company admins only
CREATE POLICY "Company admins can create checklist items"
ON public.data_room_checklist_items
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (company_id IS NULL OR is_company_admin(auth.uid(), company_id))
);

CREATE POLICY "Company admins can update checklist items"
ON public.data_room_checklist_items
FOR UPDATE
USING (
  company_id IS NOT NULL AND is_company_admin(auth.uid(), company_id)
);

CREATE POLICY "Company admins can delete checklist items"
ON public.data_room_checklist_items
FOR DELETE
USING (
  company_id IS NOT NULL AND is_company_admin(auth.uid(), company_id)
);

CREATE POLICY "Company admins can create categories"
ON public.data_room_checklist_categories
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (company_id IS NULL OR is_company_admin(auth.uid(), company_id))
);

CREATE POLICY "Company admins can update categories"
ON public.data_room_checklist_categories
FOR UPDATE
USING (
  company_id IS NOT NULL AND is_company_admin(auth.uid(), company_id)
);

CREATE POLICY "Company admins can delete categories"
ON public.data_room_checklist_categories
FOR DELETE
USING (
  company_id IS NOT NULL AND is_company_admin(auth.uid(), company_id)
);
