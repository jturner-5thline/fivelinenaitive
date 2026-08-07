ALTER TABLE public.claap_recording_links DROP CONSTRAINT IF EXISTS claap_recording_links_entity_type_check;
ALTER TABLE public.claap_recording_links ADD CONSTRAINT claap_recording_links_entity_type_check
  CHECK (entity_type = ANY (ARRAY['meeting','contact','company','deal','lender']));
ALTER TABLE public.claap_recording_links DROP CONSTRAINT IF EXISTS claap_recording_links_link_role_check;
ALTER TABLE public.claap_recording_links ADD CONSTRAINT claap_recording_links_link_role_check
  CHECK (link_role = ANY (ARRAY['primary_meeting','attendee_contact','primary_company','primary_deal','secondary_deal','funding_source']));

CREATE OR REPLACE FUNCTION public.claap_norm_org_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(p_name,'')), '[^a-z0-9]+', ' ', 'g'),
      '\y(inc|llc|lp|llp|ltd|plc|corp|corporation|company|co|capital|partners|partner|group|holdings|holding|ventures|venture|finance|financial|financing|credit|bank|banking|fund|funds|funding|management|advisors|advisory|lending|lenders|lender|investments|investment)\y', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.claap_link_recording_funding_sources(p_recording_id uuid DEFAULT NULL, p_limit integer DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  WITH rec AS (
    SELECT r.id, r.org_company_id, public.claap_norm_org_name(r.title) AS norm_title, r.participants
    FROM claap_recordings r
    WHERE (p_recording_id IS NULL OR r.id = p_recording_id)
    ORDER BY r.started_at DESC NULLS LAST
    LIMIT coalesce(p_limit, 1000000)
  ),
  lend AS (
    SELECT l.id AS lender_id, l.company_id, public.claap_norm_org_name(l.name) AS norm_name
    FROM master_lenders l
    WHERE coalesce(l.active, true)
  ),
  attendee_domains AS (
    SELECT DISTINCT r.id AS rid, r.org_company_id,
           lower(split_part(p->>'email', '@', 2)) AS dom
    FROM rec r, jsonb_array_elements(coalesce(r.participants, '[]'::jsonb)) p
    WHERE coalesce(p->>'email','') LIKE '%@%'
  ),
  lender_domains AS (
    SELECT l.id AS lender_id, l.company_id, lower(split_part(l.email,'@',2)) AS dom
      FROM master_lenders l WHERE coalesce(l.email,'') LIKE '%@%'
    UNION
    SELECT l.id, l.company_id,
           regexp_replace(regexp_replace(lower(l.website), '^https?://', ''), '^www\.', '')
      FROM master_lenders l WHERE coalesce(l.website,'') <> ''
    UNION
    SELECT lc.lender_id, l.company_id, lower(split_part(lc.email,'@',2))
      FROM lender_contacts lc
      JOIN master_lenders l ON l.id = lc.lender_id
     WHERE coalesce(lc.email,'') LIKE '%@%'
  ),
  lender_domains_clean AS (
    SELECT lender_id, company_id, split_part(split_part(dom, '/', 1), '?', 1) AS dom
    FROM lender_domains
    WHERE dom IS NOT NULL AND dom <> '' AND dom LIKE '%.%'
      AND dom NOT IN ('gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com','icloud.com','me.com','msn.com','live.com','protonmail.com','gmx.com','comcast.net')
  ),
  domain_matches AS (
    SELECT ad.rid, ld.lender_id, 0.95::numeric AS confidence
    FROM attendee_domains ad
    JOIN lender_domains_clean ld
      ON ld.dom = ad.dom
     AND (ld.company_id IS NULL OR ld.company_id = ad.org_company_id)
  ),
  name_matches AS (
    SELECT r.id AS rid, l.lender_id, 0.70::numeric AS confidence
    FROM rec r
    JOIN lend l
      ON (l.company_id IS NULL OR l.company_id = r.org_company_id)
     AND length(l.norm_name) >= 5
     AND position(l.norm_name IN r.norm_title) > 0
    WHERE r.norm_title <> ''
  ),
  all_matches AS (
    SELECT rid, lender_id, max(confidence) AS confidence
    FROM (SELECT * FROM domain_matches UNION ALL SELECT * FROM name_matches) m
    GROUP BY rid, lender_id
  ),
  ins AS (
    INSERT INTO claap_recording_links (recording_id, entity_type, entity_id, link_role, confidence, source)
    SELECT rid, 'lender', lender_id, 'funding_source', confidence, 'auto'
    FROM all_matches
    ON CONFLICT (recording_id, link_role, entity_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_claap_link_recording_funding_sources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.claap_link_recording_funding_sources(NEW.id, NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS claap_recordings_link_funding_sources ON public.claap_recordings;
CREATE TRIGGER claap_recordings_link_funding_sources
AFTER INSERT OR UPDATE OF title, participants ON public.claap_recordings
FOR EACH ROW EXECUTE FUNCTION public.trg_claap_link_recording_funding_sources();