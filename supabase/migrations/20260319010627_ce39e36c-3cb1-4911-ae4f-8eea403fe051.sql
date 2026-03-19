DO $$
DECLARE
  in_dev_pipeline_id uuid;
  affected_count integer;
BEGIN
  SELECT id INTO in_dev_pipeline_id
  FROM public.deal_pipelines
  WHERE name ILIKE '%in development%'
  LIMIT 1;

  IF in_dev_pipeline_id IS NULL THEN
    RAISE EXCEPTION 'In Development pipeline not found';
  END IF;

  UPDATE public.deals
  SET pipeline_id = in_dev_pipeline_id,
      status = 'on-hold',
      updated_at = now()
  WHERE (manager IS NULL OR manager = '')
    AND (pipeline_id IS DISTINCT FROM in_dev_pipeline_id);

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE 'Moved % deals with no manager to In Development pipeline', affected_count;
END;
$$;