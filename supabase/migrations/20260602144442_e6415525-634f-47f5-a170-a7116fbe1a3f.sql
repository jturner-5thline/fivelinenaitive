WITH resolved AS (
  SELECT mts.id AS mts_id, p.email AS manager_email
  FROM public.meeting_task_suggestions mts
  JOIN public.claap_meetings m ON m.id = mts.meeting_id
  JOIN public.deals d ON d.id = m.deal_id
  JOIN public.profiles p
    ON lower(btrim(p.display_name)) = lower(btrim(d.manager))
  JOIN public.company_members cm
    ON cm.user_id = p.user_id AND cm.company_id = mts.org_company_id
  WHERE mts.assignee_email IS NULL
    AND d.manager IS NOT NULL
    AND btrim(d.manager) <> ''
    AND p.email IS NOT NULL
  GROUP BY mts.id, p.email
  HAVING count(*) = 1
)
UPDATE public.meeting_task_suggestions mts
SET assignee_email = r.manager_email
FROM resolved r
WHERE mts.id = r.mts_id;