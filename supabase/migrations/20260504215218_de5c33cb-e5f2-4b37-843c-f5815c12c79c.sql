
UPDATE public.deal_pipelines
SET stages = '[
  {"id":"qual-booked","label":"Qual Booked","color":"bg-slate-500"},
  {"id":"demo-booked","label":"Demo Booked","color":"bg-blue-500"},
  {"id":"onboarding-booked","label":"Onboarding Booked","color":"bg-indigo-500"},
  {"id":"trial-active","label":"Trial Active","color":"bg-violet-500"},
  {"id":"converted","label":"Converted","color":"bg-green-500"},
  {"id":"closed-lost","label":"Closed Lost","color":"bg-red-500"},
  {"id":"tabled-on-hold","label":"Tabled — On Hold","color":"bg-amber-500"}
]'::jsonb
WHERE name = 'naitive Pipeline';

UPDATE public.deals SET stage = CASE stage
  WHEN 'prospects' THEN 'qual-booked'
  WHEN 'intro-conversations' THEN 'qual-booked'
  WHEN 'demo-completed' THEN 'demo-booked'
  WHEN 'offer-sent' THEN 'onboarding-booked'
  WHEN 'onboarding' THEN 'onboarding-booked'
  WHEN 'active-customer' THEN 'converted'
  WHEN 'close-lost-opportunity' THEN 'closed-lost'
  ELSE stage
END
WHERE pipeline_id IN (SELECT id FROM public.deal_pipelines WHERE name = 'naitive Pipeline');
