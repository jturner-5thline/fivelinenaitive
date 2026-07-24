
ALTER TABLE public.company_settings 
  ADD COLUMN IF NOT EXISTS contact_field_config JSONB NOT NULL DEFAULT '{"disabled":[],"custom":[]}'::jsonb;

-- Ensure realtime picks up changes to this column shape
ALTER TABLE public.company_settings REPLICA IDENTITY FULL;
