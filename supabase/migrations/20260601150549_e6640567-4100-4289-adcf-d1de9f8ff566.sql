DO $$
DECLARE
  v_pipeline uuid := '40b17dfb-9122-49e0-bf7c-5aa993d5d615';
  v_inserts int := 0;
  v_updates int := 0;
  v_existing_id uuid;
  v_label text;
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('ee1e4a4a-7985-4f5e-9149-90fd21a8c42b'::uuid, 'on-hold',           '2025-08-21 16:00:00+00'::timestamptz),
      ('ee1e4a4a-7985-4f5e-9149-90fd21a8c42b'::uuid, 'closed-won',        '2023-01-20 17:00:00+00'::timestamptz),
      ('ee1e4a4a-7985-4f5e-9149-90fd21a8c42b'::uuid, 'ndaneeds-list-sent','2022-11-29 17:00:00+00'::timestamptz),
      ('a6bf6ee0-a08c-4d73-b5a7-0eb7b21402ce'::uuid, 'on-hold',           '2022-11-29 17:00:00+00'::timestamptz),
      ('766ace06-2302-4cd0-b3c7-c9a7ebaa7ddc'::uuid, 'on-hold',           '2022-11-29 17:00:00+00'::timestamptz),
      ('2c6b41ff-690e-4cae-bbc4-465a2cdfcd5a'::uuid, 'on-hold',           '2022-11-29 17:00:00+00'::timestamptz),
      ('bf639b78-7511-441b-98a1-8261f1afe0a9'::uuid, 'on-hold',           '2025-10-22 16:00:00+00'::timestamptz),
      ('bf639b78-7511-441b-98a1-8261f1afe0a9'::uuid, 'ndaneeds-list-sent','2022-11-29 17:00:00+00'::timestamptz)
    ) AS t(deal_id, stage_id, new_changed_at)
  LOOP
    v_label := CASE r.stage_id
      WHEN 'on-hold' THEN 'Unresponsive'
      WHEN 'closed-won' THEN 'Indication of Interest'
      WHEN 'ndaneeds-list-sent' THEN 'Client Paused Deal'
    END;

    SELECT id INTO v_existing_id
    FROM deal_stage_history
    WHERE deal_id = r.deal_id
      AND pipeline_id = v_pipeline
      AND to_stage_id = r.stage_id
    ORDER BY changed_at ASC
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO deal_stage_history (deal_id, pipeline_id, to_stage_id, to_stage, changed_at, source)
      VALUES (r.deal_id, v_pipeline, r.stage_id, v_label, r.new_changed_at, 'backfill');
      v_inserts := v_inserts + 1;
    ELSE
      UPDATE deal_stage_history SET changed_at = r.new_changed_at WHERE id = v_existing_id;
      v_updates := v_updates + 1;
    END IF;
  END LOOP;

  IF (v_inserts + v_updates) <> 8 THEN
    RAISE EXCEPTION 'Expected 8 ops, got % inserts + % updates', v_inserts, v_updates;
  END IF;
  RAISE NOTICE 'batch3 disambig: % inserts, % updates', v_inserts, v_updates;
END $$;