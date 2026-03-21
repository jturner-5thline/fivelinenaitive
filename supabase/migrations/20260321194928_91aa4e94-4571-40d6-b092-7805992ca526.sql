-- The unique constraint on user_id alone is wrong; it should be on company_id
-- since lender_stage_configs is company-scoped. Fix by dropping the old
-- constraint and adding the correct one, plus make the seed idempotent.

ALTER TABLE public.lender_stage_configs
  DROP CONSTRAINT IF EXISTS lender_stage_configs_user_id_key;

-- Add a unique constraint on company_id instead (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.lender_stage_configs'::regclass 
    AND conname = 'lender_stage_configs_company_id_key'
  ) THEN
    -- Check for duplicates first and keep only the latest per company_id
    DELETE FROM public.lender_stage_configs a
    USING public.lender_stage_configs b
    WHERE a.company_id = b.company_id
      AND a.created_at < b.created_at;

    ALTER TABLE public.lender_stage_configs
      ADD CONSTRAINT lender_stage_configs_company_id_key UNIQUE (company_id);
  END IF;
END $$;