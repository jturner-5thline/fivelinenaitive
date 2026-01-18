-- Insert new feature flags for page access control
INSERT INTO public.feature_flags (name, description, status)
VALUES 
  ('page_dashboard', 'Dashboard page access', 'deployed'),
  ('page_newsfeed', 'News Feed page access', 'deployed'),
  ('page_metrics', 'Metrics page access', 'deployed'),
  ('page_insights', 'Insights page access', 'deployed'),
  ('page_sales_bd', 'Sales & BD page access', 'deployed'),
  ('page_hr', 'HR page access', 'staging'),
  ('page_operations', 'Operations page access', 'staging'),
  ('page_integrations', 'Integrations page access', 'deployed')
ON CONFLICT DO NOTHING;