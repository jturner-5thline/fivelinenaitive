DO $$
DECLARE
  v_pipeline UUID := '40b17dfb-9122-49e0-bf7c-5aa993d5d615';
  v_stage TEXT := 'on-hold';
  v_stage_label TEXT := 'Unresponsive';
  v_ts TIMESTAMPTZ := '2022-11-29 17:00:00+00';
  v_src TEXT := 'historical_import_5th_line_2026_06_01_batch2_disambig';
  v_ids UUID[] := ARRAY[
    'ed32fa6e-3227-4826-b394-c4f3c62198d5'::uuid,
    '38d178e7-1309-48b1-9b19-b9da86de1849'::uuid,
    'bf639b78-7511-441b-98a1-8261f1afe0a9'::uuid
  ];
  v_id UUID;
  v_match_count INT;
  v_total INT := 0;
BEGIN
  FOREACH v_id IN ARRAY v_ids LOOP
    SELECT COUNT(*) INTO v_match_count
      FROM deal_stage_history
     WHERE deal_id = v_id AND pipeline_id = v_pipeline AND to_stage_id = v_stage;

    IF v_match_count = 0 THEN
      INSERT INTO deal_stage_history (deal_id, pipeline_id, to_stage_id, to_stage, event_type, changed_at, source)
      VALUES (v_id, v_pipeline, v_stage, v_stage_label, 'stage_enter', v_ts, v_src);
    ELSE
      WITH oldest AS (
        SELECT id FROM deal_stage_history
         WHERE deal_id = v_id AND pipeline_id = v_pipeline AND to_stage_id = v_stage
         ORDER BY changed_at ASC LIMIT 1
      )
      UPDATE deal_stage_history h SET changed_at = v_ts, source = v_src, to_stage = COALESCE(h.to_stage, v_stage_label)
        FROM oldest WHERE h.id = oldest.id;
    END IF;
    v_total := v_total + 1;
  END LOOP;

  IF v_total <> 3 THEN
    RAISE EXCEPTION 'Expected 3 ops, got %', v_total;
  END IF;
END $$;