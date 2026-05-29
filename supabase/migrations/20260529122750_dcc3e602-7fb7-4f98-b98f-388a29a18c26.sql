UPDATE public.deal_pipelines
SET stages = '[
  {"id":"fs-in-development","color":"bg-zinc-500","label":"In Development"},
  {"id":"fs-qualification","color":"bg-slate-500","label":"Qualification"},
  {"id":"fs-discovery","color":"bg-blue-500","label":"Discovery"},
  {"id":"fs-qualified","color":"bg-indigo-500","label":"Qualified"},
  {"id":"fs-scoping","color":"bg-violet-500","label":"Scoping"},
  {"id":"fs-proposal-sent","color":"bg-purple-500","label":"Proposal Sent"},
  {"id":"fs-negotiation","color":"bg-amber-500","label":"Negotiation"},
  {"id":"fs-closed-won","color":"bg-green-500","label":"Active Client"},
  {"id":"fs-churned","color":"bg-orange-500","label":"Churned"},
  {"id":"fs-closed-lost","color":"bg-red-500","label":"Closed Lost"}
]'::jsonb
WHERE name = 'FinServ Pipeline';