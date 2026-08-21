UPDATE public.deals d
SET referred_by_contact_id = m.contact_id
FROM (
  SELECT d2.id AS deal_id, c.contact_id
  FROM public.deals d2
  CROSS JOIN LATERAL (
    SELECT c1.id AS contact_id
    FROM public.contacts c1
    WHERE c1.org_company_id = d2.company_id
      AND lower(btrim(c1.full_name)) IN (
        lower(regexp_replace(btrim(d2.referred_by), '\s+', ' ', 'g')),
        lower(regexp_replace(btrim(split_part(regexp_replace(d2.referred_by, '\s+(@|at|-)\s+', '|SEP|', 'gi'), '|SEP|', 1)), '\s+', ' ', 'g'))
      )
    ORDER BY (c1.email IS NULL), c1.created_at
    LIMIT 1
  ) c
  WHERE d2.referred_by IS NOT NULL AND d2.referred_by <> '' AND d2.referred_by_contact_id IS NULL
) m
WHERE d.id = m.deal_id;