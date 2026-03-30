-- Step 1: Drop enum-typed defaults
ALTER TABLE public.contacts ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.contacts ALTER COLUMN lifecycle_stage DROP DEFAULT;

ALTER TABLE public.crm_companies ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.crm_companies ALTER COLUMN lifecycle_stage DROP DEFAULT;
ALTER TABLE public.crm_companies ALTER COLUMN company_type DROP DEFAULT;

-- Step 2: Convert columns to TEXT
ALTER TABLE public.contacts
  ALTER COLUMN status TYPE text USING status::text,
  ALTER COLUMN lifecycle_stage TYPE text USING lifecycle_stage::text,
  ALTER COLUMN buying_role TYPE text USING buying_role::text;

ALTER TABLE public.crm_companies
  ALTER COLUMN status TYPE text USING status::text,
  ALTER COLUMN lifecycle_stage TYPE text USING lifecycle_stage::text,
  ALTER COLUMN company_type TYPE text USING company_type::text;

-- Step 3: Set plain text defaults
ALTER TABLE public.contacts ALTER COLUMN status SET DEFAULT 'new';
ALTER TABLE public.contacts ALTER COLUMN lifecycle_stage SET DEFAULT 'lead';

ALTER TABLE public.crm_companies ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.crm_companies ALTER COLUMN lifecycle_stage SET DEFAULT 'target';
ALTER TABLE public.crm_companies ALTER COLUMN company_type SET DEFAULT 'prospect';

-- Step 4: Drop the old enum types
DROP TYPE IF EXISTS public.contact_status;
DROP TYPE IF EXISTS public.contact_lifecycle_stage;
DROP TYPE IF EXISTS public.contact_buying_role;
DROP TYPE IF EXISTS public.crm_company_status;
DROP TYPE IF EXISTS public.crm_company_lifecycle;
DROP TYPE IF EXISTS public.crm_company_type;