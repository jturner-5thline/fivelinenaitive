
DO $$
DECLARE
  in_dev_pipeline_id uuid;
  affected_count integer;
BEGIN
  -- Look up the "In Development" pipeline
  SELECT id INTO in_dev_pipeline_id
  FROM public.deal_pipelines
  WHERE name ILIKE '%in development%'
  LIMIT 1;

  IF in_dev_pipeline_id IS NULL THEN
    RAISE NOTICE 'No "In Development" pipeline found — skipping migration.';
    RETURN;
  END IF;

  -- Move matching deals that are NOT already in the In Development pipeline
  UPDATE public.deals
  SET pipeline_id = in_dev_pipeline_id,
      status = 'on-hold',
      updated_at = now()
  WHERE (
    stage ILIKE '%unresponsive%'
    OR stage ILIKE '%benched%'
    OR stage ILIKE '%flex outreach%'
  )
  AND (pipeline_id IS DISTINCT FROM in_dev_pipeline_id);

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'Moved % deals to In Development pipeline (id: %)', affected_count, in_dev_pipeline_id;
END;
$$;
