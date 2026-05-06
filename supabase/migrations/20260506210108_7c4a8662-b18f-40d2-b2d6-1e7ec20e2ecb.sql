UPDATE public.company_settings
SET fpa_dashboard_config = (
  SELECT jsonb_object_agg(
    t.k,
    CASE
      WHEN t.k = 'qir:report-1' THEN t.v || jsonb_build_object('authors', jsonb_build_array('James Turner'))
      WHEN t.k = 'qir:report-2' THEN t.v || jsonb_build_object('authors', jsonb_build_array('John Moffitt'))
      WHEN t.k = 'qir:report-3' THEN t.v || jsonb_build_object('authors', jsonb_build_array('Scott Williams'))
      ELSE t.v
    END
  )
  FROM jsonb_each(fpa_dashboard_config) AS t(k, v)
)
WHERE fpa_dashboard_config ?| ARRAY['qir:report-1','qir:report-2','qir:report-3'];