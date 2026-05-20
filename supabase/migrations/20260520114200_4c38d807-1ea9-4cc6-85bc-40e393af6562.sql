-- Step 1: cascade delete all rows referencing the company
DO $$
DECLARE
  cid uuid := 'd41ab867-275e-4e9e-9644-ef3ffea0c9d4';
  r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.confrelid = 'public.companies'::regclass AND c.contype = 'f'
  LOOP
    EXECUTE format('DELETE FROM %s WHERE %I = $1', r.tbl, r.col) USING cid;
  END LOOP;
  DELETE FROM public.companies WHERE id = cid;
END $$;

-- Step 2: explicitly NULL the self-reference in profiles for our two users
UPDATE public.profiles SET approved_by = NULL
WHERE approved_by IN ('1311e234-3c6b-4c65-9f48-c6b355666ac8','2f08e537-6b0a-42f7-9442-cae73882ff76');

-- Step 3: delete the profile rows for the two users
DELETE FROM public.profiles
WHERE user_id IN ('1311e234-3c6b-4c65-9f48-c6b355666ac8','2f08e537-6b0a-42f7-9442-cae73882ff76');

-- Step 4: best-effort cleanup of any other public-schema FKs to auth.users for these users
DO $$
DECLARE
  uids uuid[] := ARRAY['1311e234-3c6b-4c65-9f48-c6b355666ac8'::uuid,'2f08e537-6b0a-42f7-9442-cae73882ff76'::uuid];
  r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass::text AS tbl, a.attname AS col, a.attnotnull AS notnull
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.confrelid = 'auth.users'::regclass
      AND c.contype = 'f'
      AND (conrelid::regclass)::text LIKE 'public.%'
  LOOP
    BEGIN
      IF r.notnull THEN
        EXECUTE format('DELETE FROM %s WHERE %I = ANY($1)', r.tbl, r.col) USING uids;
      ELSE
        EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = ANY($1)', r.tbl, r.col, r.col) USING uids;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip % %: %', r.tbl, r.col, SQLERRM;
    END;
  END LOOP;
END $$;

-- Step 5: remove the auth users
DELETE FROM auth.users WHERE id IN ('1311e234-3c6b-4c65-9f48-c6b355666ac8','2f08e537-6b0a-42f7-9442-cae73882ff76');