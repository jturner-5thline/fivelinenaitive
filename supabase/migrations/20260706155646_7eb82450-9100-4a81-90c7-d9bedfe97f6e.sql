UPDATE public.dashboard_grid_layouts
SET layout = jsonb_set(
  layout,
  '{layouts}',
  (
    SELECT jsonb_object_agg(
      bp,
      (
        SELECT jsonb_agg(
          CASE
            WHEN item->>'i' = 'finserv-next3'
              THEN jsonb_set(jsonb_set(item, '{h}', '8'::jsonb), '{minH}', '4'::jsonb)
            ELSE item
          END
        )
        FROM jsonb_array_elements(items) item
      )
    )
    FROM jsonb_each(layout->'layouts') AS bps(bp, items)
  )
)
WHERE dashboard_id = 'insights-management-review-v20';