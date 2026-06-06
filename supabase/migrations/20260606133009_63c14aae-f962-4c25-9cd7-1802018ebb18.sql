-- Backfill: null out meeting_task_suggestions.assignee_email values
-- that do not resolve to a known internal tenant member. Guarded with
-- NOT EXISTS so re-runs are no-ops.
UPDATE public.meeting_task_suggestions mts
SET assignee_email = NULL
WHERE mts.assignee_email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.company_members cm
    JOIN public.profiles p ON p.user_id = cm.user_id
    WHERE cm.company_id = mts.org_company_id
      AND lower(p.email) = lower(mts.assignee_email)
  );