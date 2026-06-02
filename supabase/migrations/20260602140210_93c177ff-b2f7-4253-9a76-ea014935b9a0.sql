ALTER TABLE public.meeting_task_suggestions
  ADD COLUMN IF NOT EXISTS external_mention text NULL;

-- Backfill: any assignee_email that is not an internal tenant member becomes external.
WITH internal_emails AS (
  SELECT cm.company_id, lower(p.email) AS email
  FROM public.company_members cm
  JOIN public.profiles p ON p.user_id = cm.user_id
  WHERE p.email IS NOT NULL
)
UPDATE public.meeting_task_suggestions s
SET external_mention = COALESCE(s.external_mention, s.assignee_email),
    assignee_email = NULL
WHERE s.assignee_email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM internal_emails ie
    WHERE ie.company_id = s.org_company_id
      AND ie.email = lower(s.assignee_email)
  );