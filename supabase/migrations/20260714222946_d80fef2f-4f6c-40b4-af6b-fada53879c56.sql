
-- 1. Clear pending queue cards for past-30d Claap recordings so re-run can enqueue fresh.
DELETE FROM public.ai_action_queue q
USING public.claap_meetings m
WHERE q.action_type = 'claap_recording_review'
  AND q.status = 'pending'
  AND (q.payload->>'claap_meeting_id')::uuid = m.id
  AND m.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  AND m.started_at >= now() - interval '30 days';

-- 2. Clear pending match suggestions for those meetings.
DELETE FROM public.claap_match_suggestions s
USING public.claap_meetings m
WHERE s.meeting_id = m.id
  AND s.status = 'pending'
  AND m.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  AND m.started_at >= now() - interval '30 days';

-- 3. Reset the meeting-side flags so the suggest-matches function re-processes them.
UPDATE public.claap_meetings
SET suggestions_generated_at = NULL,
    match_status = 'unmatched',
    match_candidates = NULL
WHERE company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'
  AND started_at >= now() - interval '30 days'
  AND manually_locked = false
  AND deal_id IS NULL;
