DO $$
DECLARE
  r RECORD;
  raw_val text;
  pretty text;
  suffix text;
  new_title text;
BEGIN
  FOR r IN
    SELECT id, title, action_type, new_values, old_values
    FROM ai_action_queue
    WHERE status = 'pending'
      AND title IS NOT NULL
      AND title NOT ILIKE '% to "%'
  LOOP
    raw_val := NULL;
    IF r.action_type = 'update_funding_source' THEN
      raw_val := COALESCE(
        r.new_values->>'stage',
        r.new_values->>'status',
        r.new_values->>'tracking_status'
      );
    ELSIF r.action_type IN ('add_status_note','update_deal_status') THEN
      raw_val := COALESCE(r.new_values->>'status', r.new_values->>'deal_status');
    ELSIF r.action_type = 'update_deal_stage' THEN
      raw_val := COALESCE(
        r.new_values->>'stage_label',
        r.new_values->>'stage_name',
        r.new_values->>'stage'
      );
    END IF;

    IF raw_val IS NULL OR btrim(raw_val) = '' OR length(raw_val) > 40 THEN
      CONTINUE;
    END IF;

    -- Prettify: replace _/-/multiple spaces, title-case if all lowercase.
    pretty := regexp_replace(btrim(raw_val), '[_-]+', ' ', 'g');
    pretty := regexp_replace(pretty, '\s+', ' ', 'g');
    IF pretty ~ '^[a-z\s]+$' THEN
      pretty := initcap(pretty);
    END IF;

    suffix := ' to "' || pretty || '"';
    IF position(lower(suffix) IN lower(r.title)) > 0 THEN
      CONTINUE;
    END IF;

    new_title := r.title || suffix;
    UPDATE ai_action_queue SET title = new_title WHERE id = r.id;
  END LOOP;
END $$;