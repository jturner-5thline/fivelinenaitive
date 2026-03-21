-- Drop the duplicate trigger that conflicts with seed_new_company_defaults
DROP TRIGGER IF EXISTS auto_create_company_features ON public.companies;
DROP TRIGGER IF EXISTS auto_create_company_features_trigger ON public.companies;