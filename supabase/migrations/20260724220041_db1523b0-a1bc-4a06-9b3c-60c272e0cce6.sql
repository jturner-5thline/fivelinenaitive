
CREATE OR REPLACE FUNCTION public.claap_daily_link_sync(
  p_lookback_days integer DEFAULT 7
)
RETURNS TABLE(new_links integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  WITH freemail AS (
    SELECT unnest(ARRAY[
      'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com',
      'aol.com','proton.me','protonmail.com','me.com','msn.com','live.com',
      '5thline.co'
    ]) AS d
  ),
  recs AS (
    SELECT cr.id, cr.external_id, cr.title, cr.started_at,
           cr.participants, cr.recording_url, cr.org_company_id
    FROM claap_recordings cr
    WHERE cr.org_company_id IS NOT NULL
      AND cr.title IS NOT NULL
      AND COALESCE(cr.started_at, cr.created_at) > now() - make_interval(days => p_lookback_days)
  ),
  d AS (
    SELECT id, company, contact_email, company_id
    FROM deals
    WHERE company_id IS NOT NULL
      AND company IS NOT NULL
      AND length(company) >= 4
      AND lower(company) NOT LIKE 'test %'
      AND lower(company) NOT IN ('example deal', 'test-niki''s store')
  ),
  deal_domains AS (
    SELECT d.id AS deal_id, d.company_id, lower(split_part(d.contact_email,'@',2)) AS dom
    FROM d WHERE d.contact_email ILIKE '%@%'
    UNION
    SELECT cd.deal_id, d.company_id, lower(split_part(c.email,'@',2))
    FROM contact_deals cd
    JOIN d ON d.id = cd.deal_id
    JOIN contacts c ON c.id = cd.contact_id
    WHERE c.email ILIKE '%@%'
    UNION
    SELECT cd.deal_id, d.company_id, lower(split_part(ae,'@',2))
    FROM contact_deals cd
    JOIN d ON d.id = cd.deal_id
    JOIN contacts c ON c.id = cd.contact_id,
         unnest(COALESCE(c.additional_emails,'{}')) ae
    WHERE ae ILIKE '%@%'
  ),
  deal_domains_clean AS (
    SELECT DISTINCT deal_id, company_id, dom
    FROM deal_domains
    WHERE dom IS NOT NULL AND dom <> ''
      AND dom NOT IN (SELECT d FROM freemail)
  ),
  title_matches AS (
    SELECT r.external_id, r.title, r.started_at, r.recording_url, d.id AS deal_id
    FROM recs r
    JOIN d ON d.company_id = r.org_company_id
         AND r.title ILIKE '%' || d.company || '%'
  ),
  rec_domains AS (
    SELECT r.external_id, r.title, r.started_at, r.recording_url,
           r.org_company_id,
           lower(split_part(p->>'email','@',2)) AS dom
    FROM recs r, jsonb_array_elements(r.participants) p
    WHERE p->>'email' ILIKE '%@%'
  ),
  domain_matches AS (
    SELECT rd.external_id, rd.title, rd.started_at, rd.recording_url,
           dd.deal_id
    FROM rec_domains rd
    JOIN deal_domains_clean dd
      ON dd.dom = rd.dom
     AND dd.company_id = rd.org_company_id
    WHERE rd.dom NOT IN (SELECT d FROM freemail)
  ),
  all_matches AS (
    SELECT DISTINCT external_id, title, started_at, recording_url, deal_id
    FROM (SELECT * FROM title_matches UNION SELECT * FROM domain_matches) x
  ),
  ins AS (
    INSERT INTO deal_claap_recordings (
      deal_id, recording_id, recording_title, recording_url, linked_at, notes
    )
    SELECT
      am.deal_id, am.external_id, am.title, am.recording_url,
      COALESCE(am.started_at, now()),
      'Auto-linked by daily Claap sync (title/domain match)'
    FROM all_matches am
    ON CONFLICT (deal_id, recording_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_inserted FROM ins;

  new_links := v_inserted;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claap_daily_link_sync(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claap_daily_link_sync(integer) TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('claap-daily-link-sync');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'claap-daily-link-sync',
  '0 6 * * *',
  $cron$ SELECT public.claap_daily_link_sync(7); $cron$
);
