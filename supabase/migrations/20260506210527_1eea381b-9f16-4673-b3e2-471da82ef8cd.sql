UPDATE public.company_settings
SET fpa_dashboard_config = (
  SELECT jsonb_object_agg(
    t.k,
    CASE WHEN t.k LIKE 'qir:report-%' THEN t.v || jsonb_build_object('narrative', '') ELSE t.v END
  )
  FROM jsonb_each(fpa_dashboard_config) AS t(k, v)
)
WHERE fpa_dashboard_config ?| ARRAY['qir:report-1','qir:report-2','qir:report-3'];