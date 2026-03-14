ALTER TABLE public.deal_saas_mappings 
ADD COLUMN IF NOT EXISTS excluded_columns jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS flipped_rows jsonb DEFAULT '[]'::jsonb;