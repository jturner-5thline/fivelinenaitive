ALTER TABLE public.deal_flag_notes 
  ADD COLUMN resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN resolved_by uuid REFERENCES auth.users(id);

-- Mark all existing flag notes as unresolved (active)
-- so they appear as current flags