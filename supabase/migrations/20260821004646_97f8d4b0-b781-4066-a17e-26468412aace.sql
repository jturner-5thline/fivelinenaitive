DO $$
DECLARE r record; d uuid := '4ae9658e-f9f8-4fa8-8ac2-33d596c5324f'; n bigint;
BEGIN
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
    WHERE c.table_schema='public' AND c.column_name='deal_id' AND c.data_type='uuid'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE deal_id = $1', r.table_name) USING d;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE 'deleted % from %', n, r.table_name; END IF;
  END LOOP;
  DELETE FROM public.deals WHERE id = d;
END $$;