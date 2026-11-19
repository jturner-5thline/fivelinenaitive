CREATE OR REPLACE VIEW public.lender_met_status WITH (security_invoker = true) AS
WITH eng AS (
  SELECT lender_id,
    min(occurred_at) FILTER (WHERE activity_type IN ('call','meeting')) AS first_met_at,
    max(occurred_at) FILTER (WHERE activity_type IN ('call','meeting')) AS last_met_at,
    count(*) FILTER (WHERE activity_type IN ('call','meeting')) AS call_meeting_count,
    max(occurred_at) AS last_engagement_at,
    bool_or(source = 'claap') AS has_claap,
    bool_or(source = 'gcal') AS has_gcal
  FROM public.lender_engagements GROUP BY lender_id
), claap AS (
  SELECT matched_lender_id AS lender_id, min(started_at) AS first_at, max(started_at) AS last_at, count(*) AS n
  FROM public.claap_meetings
  WHERE matched_lender_id IS NOT NULL AND match_status IN ('matched','manually_linked')
  GROUP BY 1
), eng_threads AS (
  SELECT lender_id, metadata->>'thread_id' AS thread_id, max(occurred_at) AS at
  FROM public.lender_engagements
  WHERE activity_type = 'email' AND metadata ? 'thread_id'
  GROUP BY 1,2 HAVING count(DISTINCT direction) FILTER (WHERE direction IN ('inbound','outbound')) = 2
), imported AS (
  SELECT DISTINCT ON (ca.contact_id, ca.occurred_at, ca.subject)
    lc.lender_id, ca.occurred_at, ca.metadata->>'thread_id' AS thread_id,
    (lower(coalesce(ca.metadata->>'from','')) = lower(coalesce(c.email,''))) AS from_lender
  FROM public.lender_contacts lc
  JOIN public.contact_activities ca ON ca.contact_id = lc.contact_id AND ca.activity_type = 'email'
  JOIN public.contacts c ON c.id = lc.contact_id
  WHERE lc.contact_id IS NOT NULL
  ORDER BY ca.contact_id, ca.occurred_at, ca.subject, ca.id
), imp_last AS (
  SELECT lender_id, max(occurred_at) AS at FROM imported GROUP BY 1
), imp_threads AS (
  SELECT lender_id, thread_id, max(occurred_at) AS at FROM imported
  WHERE thread_id IS NOT NULL GROUP BY 1,2 HAVING bool_or(from_lender) AND bool_or(NOT from_lender)
), two_way AS (
  SELECT lender_id, max(at) AS last_two_way_email_at FROM (SELECT * FROM eng_threads UNION ALL SELECT * FROM imp_threads) t GROUP BY 1
), on_deal AS (
  SELECT master_lender_id AS lender_id FROM public.deal_lenders
  WHERE master_lender_id IS NOT NULL AND lower(coalesce(stage,'')) IN
    ('sent drl','reviewing-drl','reviewing','in review','management-call-set','management-call-completed','draft-terms','term-sheet','term-sheets','terms issued','approved','funded')
  GROUP BY 1
), ids AS (
  SELECT lender_id FROM eng UNION SELECT lender_id FROM claap UNION SELECT lender_id FROM two_way UNION SELECT lender_id FROM on_deal
)
SELECT ids.lender_id,
  LEAST(eng.first_met_at, claap.first_at) AS first_met_at,
  GREATEST(eng.last_met_at, claap.last_at) AS last_met_at,
  coalesce(eng.call_meeting_count,0) + coalesce(claap.n,0) AS call_meeting_count,
  tw.last_two_way_email_at,
  GREATEST(eng.last_engagement_at, claap.last_at, il.at) AS last_engagement_at,
  (od.lender_id IS NOT NULL) AS on_deal_sent_drl_or_later,
  array_remove(ARRAY[
    CASE WHEN coalesce(eng.has_claap,false) OR claap.n > 0 THEN 'claap_call' END,
    CASE WHEN tw.lender_id IS NOT NULL THEN 'two_way_email' END,
    CASE WHEN od.lender_id IS NOT NULL THEN 'on_deal' END,
    CASE WHEN coalesce(eng.has_gcal,false) THEN 'calendar_event' END], NULL) AS signals,
  (coalesce(eng.call_meeting_count,0) + coalesce(claap.n,0) > 0 OR tw.lender_id IS NOT NULL OR od.lender_id IS NOT NULL) AS is_met
FROM ids
LEFT JOIN eng ON eng.lender_id = ids.lender_id
LEFT JOIN claap ON claap.lender_id = ids.lender_id
LEFT JOIN imp_last il ON il.lender_id = ids.lender_id
LEFT JOIN two_way tw ON tw.lender_id = ids.lender_id
LEFT JOIN on_deal od ON od.lender_id = ids.lender_id;

GRANT SELECT ON public.lender_met_status TO authenticated;
GRANT SELECT ON public.lender_met_status TO service_role;