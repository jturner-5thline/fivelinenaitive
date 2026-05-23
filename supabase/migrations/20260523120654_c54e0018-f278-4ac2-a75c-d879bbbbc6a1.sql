ALTER TABLE public.qbo_pnl_snapshots ADD COLUMN IF NOT EXISTS net_operating_income NUMERIC;

-- Backfill from existing raw_response Net Operating Income summary rows
UPDATE public.qbo_pnl_snapshots
SET net_operating_income = sub.val::numeric
FROM (
  SELECT s.id,
         (jsonb_path_query_first(s.raw_response, '$.Rows.Row[*] ? (@.group == "NetOperatingIncome").Summary.ColData[1].value'))#>>'{}' AS val
  FROM public.qbo_pnl_snapshots s
) sub
WHERE sub.id = qbo_pnl_snapshots.id
  AND sub.val IS NOT NULL
  AND sub.val ~ '^-?[0-9]+(\.[0-9]+)?$';