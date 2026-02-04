-- Update RLS policies for data_room_checklist_items to be company-wide
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can create their own checklist items" ON public.data_room_checklist_items;
DROP POLICY IF EXISTS "Users can update their own checklist items" ON public.data_room_checklist_items;
DROP POLICY IF EXISTS "Users can delete their own checklist items" ON public.data_room_checklist_items;

-- Create new company-wide policies for INSERT
CREATE POLICY "Company members can create checklist items"
ON public.data_room_checklist_items FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND (
    company_id IS NULL 
    OR public.is_company_member(auth.uid(), company_id)
  )
);

-- Create new company-wide policies for UPDATE
CREATE POLICY "Company members can update checklist items"
ON public.data_room_checklist_items FOR UPDATE
USING (
  auth.uid() = user_id 
  OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id))
);

-- Create new company-wide policies for DELETE
CREATE POLICY "Company members can delete checklist items"
ON public.data_room_checklist_items FOR DELETE
USING (
  auth.uid() = user_id 
  OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id))
);

-- Do the same for data_room_checklist_categories
DROP POLICY IF EXISTS "Users can insert their own categories" ON public.data_room_checklist_categories;
DROP POLICY IF EXISTS "Users can update their own categories" ON public.data_room_checklist_categories;
DROP POLICY IF EXISTS "Users can delete their own categories" ON public.data_room_checklist_categories;

-- Create new company-wide policies for categories
CREATE POLICY "Company members can create categories"
ON public.data_room_checklist_categories FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND (
    company_id IS NULL 
    OR public.is_company_member(auth.uid(), company_id)
  )
);

CREATE POLICY "Company members can update categories"
ON public.data_room_checklist_categories FOR UPDATE
USING (
  auth.uid() = user_id 
  OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id))
);

CREATE POLICY "Company members can delete categories"
ON public.data_room_checklist_categories FOR DELETE
USING (
  auth.uid() = user_id 
  OR (company_id IS NOT NULL AND public.is_company_member(auth.uid(), company_id))
);