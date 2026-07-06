UPDATE public.dashboard_grid_layouts
SET layout = jsonb_set(
  layout,
  '{layouts}',
  (
    SELECT jsonb_object_agg(bp, new_items)
    FROM (
      SELECT bp,
        jsonb_agg(
          CASE WHEN item->>'i' = 'active-deals-list'
            THEN item || jsonb_build_object('h', 8, 'minH', 6)
            ELSE item
          END
        ) AS new_items
      FROM jsonb_each(layout->'layouts') AS bps(bp, items),
           jsonb_array_elements(items) AS item
      GROUP BY bp
    ) t
  )
),
updated_at = now()
WHERE dashboard_id = 'insights-management-review-v20';