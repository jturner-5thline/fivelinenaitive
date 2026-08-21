UPDATE public.deals d
SET referred_by_crm_company_id = c.crm_company_id
FROM public.contacts c
WHERE d.referred_by_contact_id = c.id
  AND c.crm_company_id IS NOT NULL
  AND d.referred_by_crm_company_id IS NULL;

UPDATE public.deals d
SET referred_by_crm_company_id = m.crm_company_id
FROM (
  SELECT d2.id AS deal_id, cc.crm_company_id
  FROM public.deals d2
  CROSS JOIN LATERAL (
    SELECT c1.id AS crm_company_id
    FROM public.crm_companies c1
    WHERE c1.org_company_id = d2.company_id
      AND lower(btrim(c1.name)) = lower(regexp_replace(btrim(d2.referred_by), '\s+', ' ', 'g'))
    ORDER BY c1.created_at
    LIMIT 1
  ) cc
  WHERE d2.referred_by IS NOT NULL AND d2.referred_by <> '' AND d2.referred_by_crm_company_id IS NULL
) m
WHERE d.id = m.deal_id;