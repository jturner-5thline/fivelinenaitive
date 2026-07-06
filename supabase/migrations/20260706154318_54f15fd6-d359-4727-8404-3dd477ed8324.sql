UPDATE public.dashboard_grid_layouts
SET layout = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'i' = 'cashflow-ops'
        THEN jsonb_set(jsonb_set(elem, '{h}', '4'::jsonb), '{minH}', '3'::jsonb)
      ELSE elem
    END
  )
  FROM jsonb_array_elements(layout) elem
)
WHERE dashboard_id = 'insights-management-review-v20'
  AND jsonb_typeof(layout) = 'array';

UPDATE public.dashboard_grid_layouts
SET layout = jsonb_set(
  layout,
  '{lg}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'i' = 'cashflow-ops'
          THEN jsonb_set(jsonb_set(elem, '{h}', '4'::jsonb), '{minH}', '3'::jsonb)
        ELSE elem
      END
    )
    FROM jsonb_array_elements(layout->'lg') elem
  )
)
WHERE dashboard_id = 'insights-management-review-v20'
  AND jsonb_typeof(layout) = 'object'
  AND layout ? 'lg';