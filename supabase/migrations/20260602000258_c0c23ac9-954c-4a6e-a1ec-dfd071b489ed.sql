
DO $$
DECLARE
  v_company uuid := 'c6ee8b49-b3cf-4abd-9240-4b937b961733';
  v_user uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE email = 'cday@griffinmoor.com';

  -- Delete all data scoped to the company via dynamic loop over tables with company_id
  FOR v_user IN
    SELECT NULL::uuid WHERE FALSE
  LOOP NULL; END LOOP;
END $$;

-- Wipe tenant data: iterate all public tables that have a company_id column
DO $$
DECLARE
  v_company uuid := 'c6ee8b49-b3cf-4abd-9240-4b937b961733';
  r record;
BEGIN
  FOR r IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND column_name IN ('company_id','org_company_id')
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name) USING v_company;
  END LOOP;
END $$;

-- Remove user role + membership rows tied to this user
DELETE FROM public.user_roles WHERE user_id IN (SELECT id FROM auth.users WHERE email='cday@griffinmoor.com');
DELETE FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE email='cday@griffinmoor.com')
   OR user_id IN (SELECT id FROM auth.users WHERE email='cday@griffinmoor.com');

-- Delete the company itself
DELETE FROM public.companies WHERE id = 'c6ee8b49-b3cf-4abd-9240-4b937b961733';

-- Delete the auth user
DELETE FROM auth.users WHERE email = 'cday@griffinmoor.com';
