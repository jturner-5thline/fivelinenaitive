
-- One-time 5th Line contact import: create missing Contact Type tags, then update
-- contacts.lead_status and contacts.contact_type from a staged sheet load.

-- 1) Insert missing Contact Type tags for 5th Line (case-insensitive match)
WITH req(name) AS (
  VALUES
   ('5th Line Capital'),('5th Line Stakeholder'),('Accelerator / Incubator'),
   ('Angel Investor'),('Bank'),('Contract CFO'),('Current Client'),('FLEx Lender'),
   ('Family Offices'),('Fin Serv Client'),('Investment Bank'),('James''s Contact'),
   ('John''s Contact'),('Lawyer'),('Lender'),('M&A Advisor'),('Management Consultant'),
   ('Media'),('NA'),('PE Firm'),('Partner'),('Past Client'),('Peter''s Contact'),
   ('Prospect'),('Prospect (CAPEX)'),('Prospect (CFO Target)'),('Prospect (PE-backing)'),
   ('Prospect (Service Company)'),('Prospect (UK)'),('Prospect (no-backing)'),
   ('Referral Source'),('Refinancing Source'),('Scott''s Contact'),('VC Firm')
)
INSERT INTO public.contact_types (company_id, name, sort_order, is_active)
SELECT '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid, r.name, 100, true
FROM req r
WHERE NOT EXISTS (
  SELECT 1 FROM public.contact_types ct
  WHERE ct.company_id='44556c46-9127-4b12-b14e-d6fee784afcf'
    AND lower(trim(ct.name)) = lower(trim(r.name))
);

-- 2) Create a permanent staging table so we can COPY data in via psql
DROP TABLE IF EXISTS public._import_5thline_stage;
CREATE TABLE public._import_5thline_stage (
  email text PRIMARY KEY,
  last_name_lc text,
  lead_status text,
  contact_type text
);
GRANT ALL ON public._import_5thline_stage TO service_role;
ALTER TABLE public._import_5thline_stage ENABLE ROW LEVEL SECURITY;
-- no policies = locked to client; service_role bypasses RLS
