ALTER TABLE public.crm_companies 
  ADD COLUMN IF NOT EXISTS year_founded integer,
  ADD COLUMN IF NOT EXISTS financing_status text;