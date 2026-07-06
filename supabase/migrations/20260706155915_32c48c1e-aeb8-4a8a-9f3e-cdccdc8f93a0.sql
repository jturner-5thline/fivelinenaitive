UPDATE public.dashboard_grid_layouts
SET layout = jsonb_set(
  layout,
  '{layouts}',
  (
    SELECT jsonb_object_agg(
      bp,
      (
        SELECT COALESCE(jsonb_agg(
          CASE
            WHEN item->>'i' = 'liabilities'
              THEN jsonb_set(jsonb_set(item, '{h}', '9'::jsonb), '{minH}', '6'::jsonb)
            ELSE item
          END
        ), '[]'::jsonb)
        FROM jsonb_array_elements(items) item
        WHERE item->>'i' NOT IN ('ttm-dscr', 'monthly-debt-payments')
      )
    )
    FROM jsonb_each(layout->'layouts') AS bps(bp, items)
  )
)
WHERE dashboard_id = 'insights-management-review-v20';