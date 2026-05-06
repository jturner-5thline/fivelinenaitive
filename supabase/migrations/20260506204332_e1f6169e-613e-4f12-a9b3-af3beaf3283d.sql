UPDATE public.company_settings
SET fpa_dashboard_config = (
  SELECT jsonb_object_agg(
    k,
    CASE
      WHEN k IN ('qir:report-1','qir:report-2','qir:report-3',
                 'naitive.quarterlyReport.v1.report1',
                 'naitive.quarterlyReport.v1.report2',
                 'naitive.quarterlyReport.v1.report3')
        AND jsonb_typeof(v) = 'object'
      THEN v || jsonb_build_object('narrative', '', 'kpis', '[]'::jsonb, 'risks', '[]'::jsonb)
      ELSE v
    END
  )
  FROM jsonb_each(fpa_dashboard_config) AS t(k, v)
)
WHERE fpa_dashboard_config ?| ARRAY[
  'qir:report-1','qir:report-2','qir:report-3',
  'naitive.quarterlyReport.v1.report1',
  'naitive.quarterlyReport.v1.report2',
  'naitive.quarterlyReport.v1.report3'
];