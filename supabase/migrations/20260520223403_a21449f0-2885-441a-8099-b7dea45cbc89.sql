ALTER TABLE public.master_lenders 
  ADD COLUMN IF NOT EXISTS funding_source_notes text,
  ADD COLUMN IF NOT EXISTS about_notes text;