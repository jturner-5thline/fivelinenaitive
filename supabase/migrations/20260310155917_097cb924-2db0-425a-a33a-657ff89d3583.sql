
-- 1. Backfill NULL company_id on data_room_checklist_items using the creator's company
UPDATE public.data_room_checklist_items
SET company_id = cm.company_id
FROM public.company_members cm
WHERE data_room_checklist_items.company_id IS NULL
  AND data_room_checklist_items.user_id = cm.user_id;

-- 2. Drop the old SELECT policy
DROP POLICY IF EXISTS "Users can view their own checklist items" ON public.data_room_checklist_items;

-- 3. Create a new SELECT policy that uses company membership via the item's company_id
-- This ensures all members of a company see the same checklist items
CREATE POLICY "Company members can view checklist items"
ON public.data_room_checklist_items FOR SELECT
USING (
  public.is_company_member(auth.uid(), company_id)
  OR auth.uid() = user_id
);
