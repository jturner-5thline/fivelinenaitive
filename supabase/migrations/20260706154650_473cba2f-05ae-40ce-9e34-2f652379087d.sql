-- Keep the Insights CashFlow widget exactly aligned with the
-- 12-Week Cashflow Forecast widget in the shared backend layout payload.
WITH target_rows AS (
  SELECT
    id,
    COALESCE((layout #> '{layouts,lg}'), layout) AS source_layout
  FROM public.dashboard_grid_layouts
  WHERE dashboard_id = 'insights-management-review-v20'
), cashflow_target AS (
  SELECT
    id,
    COALESCE((item->>'h')::int, 4) AS target_h,
    COALESCE((item->>'minH')::int, 3) AS target_min_h
  FROM target_rows
  CROSS JOIN LATERAL jsonb_array_elements(source_layout) AS item
  WHERE item->>'i' = 'cashflow-12w'
), rebuilt_breakpoints AS (
  SELECT
    dgl.id,
    bp.key AS breakpoint,
    jsonb_agg(
      CASE
        WHEN item->>'i' = 'cashflow-ops' THEN
          jsonb_set(
            jsonb_set(item, '{h}', to_jsonb(ct.target_h)),
            '{minH}', to_jsonb(ct.target_min_h)
          )
        ELSE item
      END
      ORDER BY item_ord
    ) AS rebuilt_layout
  FROM public.dashboard_grid_layouts dgl
  JOIN cashflow_target ct ON ct.id = dgl.id
  CROSS JOIN LATERAL jsonb_each(dgl.layout->'layouts') AS bp(key, value)
  CROSS JOIN LATERAL jsonb_array_elements(bp.value) WITH ORDINALITY AS arr(item, item_ord)
  WHERE dgl.dashboard_id = 'insights-management-review-v20'
    AND jsonb_typeof(dgl.layout) = 'object'
    AND jsonb_typeof(dgl.layout->'layouts') = 'object'
  GROUP BY dgl.id, bp.key
), rebuilt_payloads AS (
  SELECT
    dgl.id,
    jsonb_set(
      dgl.layout,
      '{layouts}',
      jsonb_object_agg(rb.breakpoint, rb.rebuilt_layout)
    ) AS next_layout
  FROM public.dashboard_grid_layouts dgl
  JOIN rebuilt_breakpoints rb ON rb.id = dgl.id
  WHERE dgl.dashboard_id = 'insights-management-review-v20'
  GROUP BY dgl.id, dgl.layout
)
UPDATE public.dashboard_grid_layouts dgl
SET layout = rp.next_layout,
    updated_at = now()
FROM rebuilt_payloads rp
WHERE dgl.id = rp.id;

-- Backward compatibility for legacy rows stored as a raw layout array.
WITH cashflow_target AS (
  SELECT
    dgl.id,
    COALESCE((item->>'h')::int, 4) AS target_h,
    COALESCE((item->>'minH')::int, 3) AS target_min_h
  FROM public.dashboard_grid_layouts dgl
  CROSS JOIN LATERAL jsonb_array_elements(dgl.layout) AS item
  WHERE dgl.dashboard_id = 'insights-management-review-v20'
    AND jsonb_typeof(dgl.layout) = 'array'
    AND item->>'i' = 'cashflow-12w'
), rebuilt_arrays AS (
  SELECT
    dgl.id,
    jsonb_agg(
      CASE
        WHEN item->>'i' = 'cashflow-ops' THEN
          jsonb_set(
            jsonb_set(item, '{h}', to_jsonb(ct.target_h)),
            '{minH}', to_jsonb(ct.target_min_h)
          )
        ELSE item
      END
      ORDER BY item_ord
    ) AS next_layout
  FROM public.dashboard_grid_layouts dgl
  JOIN cashflow_target ct ON ct.id = dgl.id
  CROSS JOIN LATERAL jsonb_array_elements(dgl.layout) WITH ORDINALITY AS arr(item, item_ord)
  WHERE dgl.dashboard_id = 'insights-management-review-v20'
    AND jsonb_typeof(dgl.layout) = 'array'
  GROUP BY dgl.id
)
UPDATE public.dashboard_grid_layouts dgl
SET layout = rb.next_layout,
    updated_at = now()
FROM rebuilt_arrays rb
WHERE dgl.id = rb.id;