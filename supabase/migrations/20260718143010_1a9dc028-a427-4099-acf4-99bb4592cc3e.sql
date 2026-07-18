
UPDATE public.insights_metric_targets
SET metric_key = 'plan:sales-dashboard-v2:deals-signed',
    metric_label = 'Deals Signed · Sales Dashboard',
    updated_at = now()
WHERE metric_key = 'plan:sales-dashboard-v2:clients-signed'
  AND NOT EXISTS (
    SELECT 1 FROM public.insights_metric_targets t2
    WHERE t2.company_id = insights_metric_targets.company_id
      AND t2.metric_key = 'plan:sales-dashboard-v2:deals-signed'
      AND t2.period_month = insights_metric_targets.period_month
  );

DELETE FROM public.insights_metric_targets
WHERE metric_key = 'plan:sales-dashboard-v2:clients-signed';
