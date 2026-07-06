
-- Backfill company_id on tasks that are already synced to Asana but have a null
-- company_id (legacy calendar-followup rows). Use the assignee's or creator's
-- primary company as a best-effort resolution.
UPDATE public.tasks t
SET company_id = cm.company_id
FROM public.company_members cm
WHERE t.company_id IS NULL
  AND t.asana_task_gid IS NOT NULL
  AND cm.user_id = COALESCE(t.assigned_to, t.created_by)
  AND cm.company_id IS NOT NULL;
