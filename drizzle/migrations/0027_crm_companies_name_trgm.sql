CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_crm_companies_name_trgm ON public.crm_companies USING gin (name gin_trgm_ops);