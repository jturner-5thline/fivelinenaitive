ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state_region text,
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS lead_status text,
  ADD COLUMN IF NOT EXISTS last_contacted_date timestamptz,
  ADD COLUMN IF NOT EXISTS opted_out_one_to_one boolean;