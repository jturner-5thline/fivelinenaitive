
-- Private store for the Nylas webhook signing secret (service role only)
CREATE TABLE public.nylas_webhook_config (
  id text PRIMARY KEY DEFAULT 'default',
  webhook_id text,
  webhook_secret text,
  callback_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.nylas_webhook_config TO service_role;
ALTER TABLE public.nylas_webhook_config ENABLE ROW LEVEL SECURITY;
-- No policies: only the service role (edge functions) can read/write.

-- Match email addresses/domains to deals visible to a mailbox owner's workspace
CREATE OR REPLACE FUNCTION public.match_deals_for_email(_user_id uuid, _emails text[], _domains text[])
RETURNS TABLE(deal_id uuid, reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH team AS (
    SELECT DISTINCT cm2.user_id
    FROM company_members cm1
    JOIN company_members cm2 ON cm2.company_id = cm1.company_id
    WHERE cm1.user_id = _user_id
    UNION SELECT _user_id
  ),
  team_orgs AS (
    SELECT company_id FROM company_members WHERE user_id = _user_id
  ),
  by_contact AS (
    SELECT DISTINCT cd.deal_id, 'contact'::text AS reason
    FROM contacts c
    JOIN contact_deals cd ON cd.contact_id = c.id
    JOIN deals d ON d.id = cd.deal_id
    WHERE (c.org_company_id IN (SELECT company_id FROM team_orgs) OR c.org_company_id IS NULL)
      AND d.user_id IN (SELECT user_id FROM team)
      AND (
        lower(c.email) = ANY(_emails)
        OR EXISTS (SELECT 1 FROM unnest(coalesce(c.additional_emails, '{}')) ae WHERE lower(ae) = ANY(_emails))
      )
  ),
  by_domain AS (
    SELECT DISTINCT d.id AS deal_id, 'domain'::text AS reason
    FROM deals d
    WHERE coalesce(array_length(_domains, 1), 0) > 0
      AND d.user_id IN (SELECT user_id FROM team)
      AND d.company_url IS NOT NULL
      AND split_part(split_part(regexp_replace(regexp_replace(lower(trim(d.company_url)), '^https?://', ''), '^www\.', ''), '/', 1), '?', 1) = ANY(_domains)
  )
  SELECT * FROM by_contact
  UNION
  SELECT b.* FROM by_domain b WHERE b.deal_id NOT IN (SELECT deal_id FROM by_contact);
$$;
REVOKE ALL ON FUNCTION public.match_deals_for_email(uuid, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_deals_for_email(uuid, text[], text[]) TO service_role;
