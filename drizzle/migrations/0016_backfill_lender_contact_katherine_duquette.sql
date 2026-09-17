WITH lc AS (
  SELECT lc.id, lc.name, lc.email, lc.title, lc.phone, ml.crm_company_id, cc.org_company_id
  FROM public.lender_contacts lc
  JOIN public.master_lenders ml ON ml.id = lc.lender_id
  LEFT JOIN public.crm_companies cc ON cc.id = ml.crm_company_id
  WHERE lc.id = '855092f6-5628-45fa-b55b-15c38a44a251' AND lc.contact_id IS NULL
), ins AS (
  INSERT INTO public.contacts (first_name, last_name, email, job_title, phone_work, crm_company_id, org_company_id, email_domain_normalized)
  SELECT split_part(lc.name, ' ', 1),
         NULLIF(regexp_replace(lc.name, '^\S+\s*', ''), ''),
         lower(lc.email),
         lc.title,
         lc.phone,
         lc.crm_company_id,
         lc.org_company_id,
         split_part(lower(lc.email), '@', 2)
  FROM lc
  RETURNING id
)
UPDATE public.lender_contacts SET contact_id = (SELECT id FROM ins)
WHERE id = '855092f6-5628-45fa-b55b-15c38a44a251';