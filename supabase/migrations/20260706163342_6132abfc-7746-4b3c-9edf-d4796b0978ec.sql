INSERT INTO public.company_features (company_id, assist_enabled)
VALUES ('6114fade-e101-4dfa-9159-9870135832df', true)
ON CONFLICT (company_id) DO UPDATE SET assist_enabled = true;