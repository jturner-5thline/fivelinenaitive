ALTER TABLE public.deal_milestones DISABLE TRIGGER on_milestone_change_notify_email;
ALTER TABLE public.deal_milestones DISABLE TRIGGER agent_trigger_on_milestones;

INSERT INTO public.deal_stage_history (deal_id, company_id, pipeline_id, from_stage, to_stage, changed_at, event_type, source)
SELECT '285820ca-eebe-405d-8b84-e776e84ff47b', '44556c46-9127-4b12-b14e-d6fee784afcf', 'b78ad452-b489-4c89-8a91-789347c05f79', 'ndaneeds-list-sent', 'pre-credit-needs', '2026-04-22 00:00:00+00', 'stage_enter', 'backfill'
WHERE NOT EXISTS (SELECT 1 FROM public.deal_stage_history WHERE deal_id='285820ca-eebe-405d-8b84-e776e84ff47b' AND to_stage='pre-credit-needs');

UPDATE public.deal_stage_history SET from_stage='pre-credit-needs' WHERE id='f29bd1e1-8ba9-4614-9a74-b13d3f22d9f3' AND from_stage IS NULL;

UPDATE public.deal_milestones SET due_date='2026-08-25' WHERE id='457e4e0e-dd32-4687-83f0-bb7e458742a9' AND due_date IS NULL;

INSERT INTO public.deal_milestones (deal_id, user_id, title, due_date, completed, completed_at, position)
SELECT '285820ca-eebe-405d-8b84-e776e84ff47b', '922430ff-8453-40eb-8d69-68f7276ad1ab', v.title, v.due::date, true, v.done::timestamptz, v.pos
FROM (VALUES ('Client Signed','2026-05-15','2026-04-28 17:08:50+00',1),('Term Sheet Signed','2026-09-26','2026-06-22 14:51:39+00',2)) v(title,due,done,pos)
WHERE NOT EXISTS (SELECT 1 FROM public.deal_milestones m WHERE m.deal_id='285820ca-eebe-405d-8b84-e776e84ff47b' AND lower(m.title)=lower(v.title));

ALTER TABLE public.deal_milestones ENABLE TRIGGER on_milestone_change_notify_email;
ALTER TABLE public.deal_milestones ENABLE TRIGGER agent_trigger_on_milestones;