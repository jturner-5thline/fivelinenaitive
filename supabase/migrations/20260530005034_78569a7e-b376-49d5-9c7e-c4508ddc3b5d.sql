ALTER TABLE public.claap_recordings
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS action_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS key_takeaways jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS synthesized_note jsonb,
  ADD COLUMN IF NOT EXISTS synthesized_note_generated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS claap_summary_synced_at timestamp with time zone;

UPDATE public.claap_recordings cr
SET summary = COALESCE(cr.summary, cm.ai_summary),
    action_items = CASE
      WHEN jsonb_typeof(cr.action_items) = 'array' AND jsonb_array_length(cr.action_items) > 0 THEN cr.action_items
      ELSE to_jsonb(COALESCE(cm.next_steps, ARRAY[]::text[]))
    END,
    key_takeaways = CASE
      WHEN jsonb_typeof(cr.key_takeaways) = 'array' AND jsonb_array_length(cr.key_takeaways) > 0 THEN cr.key_takeaways
      ELSE to_jsonb(COALESCE(cm.key_decisions, ARRAY[]::text[]))
    END,
    claap_summary_synced_at = CASE
      WHEN cm.ai_summary IS NOT NULL OR COALESCE(array_length(cm.next_steps, 1), 0) > 0 OR COALESCE(array_length(cm.key_decisions, 1), 0) > 0
        THEN COALESCE(cr.claap_summary_synced_at, now())
      ELSE cr.claap_summary_synced_at
    END
FROM public.claap_meetings cm
WHERE cm.claap_id = cr.external_id
  AND (
    cr.summary IS DISTINCT FROM COALESCE(cr.summary, cm.ai_summary)
    OR (jsonb_typeof(cr.action_items) = 'array' AND jsonb_array_length(cr.action_items) = 0 AND COALESCE(array_length(cm.next_steps, 1), 0) > 0)
    OR (jsonb_typeof(cr.key_takeaways) = 'array' AND jsonb_array_length(cr.key_takeaways) = 0 AND COALESCE(array_length(cm.key_decisions, 1), 0) > 0)
    OR cr.claap_summary_synced_at IS NULL
  );

CREATE OR REPLACE FUNCTION public.claap_assert_prefill_examples()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_count integer;
BEGIN
  SELECT count(*)
  INTO matched_count
  FROM public.claap_recordings cr
  WHERE (
    cr.title ILIKE '%Datarails%'
    OR cr.title ILIKE '%Shimmy Ruben%'
    OR cr.title ILIKE '%Blount Consulting%'
  )
  AND (
    NULLIF(btrim(COALESCE(cr.summary, '')), '') IS NOT NULL
    OR COALESCE(jsonb_array_length(COALESCE(cr.action_items, '[]'::jsonb)), 0) > 0
    OR COALESCE(jsonb_array_length(COALESCE(cr.key_takeaways, '[]'::jsonb)), 0) > 0
    OR (
      cr.synthesized_note IS NOT NULL
      AND (
        NULLIF(btrim(COALESCE(cr.synthesized_note->>'summary_md', '')), '') IS NOT NULL
        OR COALESCE(jsonb_array_length(COALESCE(cr.synthesized_note->'action_items', '[]'::jsonb)), 0) > 0
        OR COALESCE(jsonb_array_length(COALESCE(cr.synthesized_note->'key_takeaways', '[]'::jsonb)), 0) > 0
      )
    )
  );

  IF matched_count = 0 THEN
    RAISE EXCEPTION 'claap_assert_prefill_examples failed: no example recordings have real or synthesized note content';
  END IF;
END;
$$;