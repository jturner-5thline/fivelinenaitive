CREATE TABLE public._stage_hs_companies_import (
  name text,
  create_date timestamptz,
  domain text,
  city text,
  country text,
  industry text,
  employee_count numeric,
  year_founded numeric,
  financing_status text,
  website_url text,
  employee_range text,
  description text
);
GRANT ALL ON public._stage_hs_companies_import TO service_role;
ALTER TABLE public._stage_hs_companies_import ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no_client_access" ON public._stage_hs_companies_import FOR ALL USING (false) WITH CHECK (false);