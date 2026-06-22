
-- =========================================================================
-- Contact ↔ Company Domain Sync (platform-wide)
-- =========================================================================

-- 1. New columns on contacts ------------------------------------------------
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'unmatched'
    CHECK (match_status IN ('unmatched','matched','needs_review','ignored')),
  ADD COLUMN IF NOT EXISTS match_confidence numeric(3,2),
  ADD COLUMN IF NOT EXISTS match_source text,
  ADD COLUMN IF NOT EXISTS last_match_run_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_contacts_match_status
  ON public.contacts (org_company_id, match_status);

-- 2. Audit table ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_company_match_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  proposed_company_id uuid,
  raw_contact_email text,
  raw_company_website text,
  normalized_contact_domain text,
  normalized_company_domain text,
  decision text NOT NULL CHECK (decision IN ('auto_matched','suggested','ignored','rejected','no_match','manual_override')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT ON public.contact_company_match_audit TO authenticated;
GRANT ALL ON public.contact_company_match_audit TO service_role;
ALTER TABLE public.contact_company_match_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read audit"
  ON public.contact_company_match_audit FOR SELECT
  TO authenticated
  USING (org_company_id = ANY(public.get_user_company_ids(auth.uid())));

CREATE INDEX IF NOT EXISTS idx_ccma_org ON public.contact_company_match_audit (org_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ccma_contact ON public.contact_company_match_audit (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ccma_decision ON public.contact_company_match_audit (org_company_id, decision);

-- 3. Settings table ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.domain_match_settings (
  org_company_id uuid PRIMARY KEY,
  auto_apply boolean NOT NULL DEFAULT true,
  subdomain_matching boolean NOT NULL DEFAULT false,
  ignored_domains text[] NOT NULL DEFAULT '{}',
  extra_freemail_domains text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE ON public.domain_match_settings TO authenticated;
GRANT ALL ON public.domain_match_settings TO service_role;
ALTER TABLE public.domain_match_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read settings"
  ON public.domain_match_settings FOR SELECT
  TO authenticated
  USING (org_company_id = ANY(public.get_user_company_ids(auth.uid())));

CREATE POLICY "admins write settings"
  ON public.domain_match_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    org_company_id = ANY(public.get_user_company_ids(auth.uid()))
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "admins update settings"
  ON public.domain_match_settings FOR UPDATE
  TO authenticated
  USING (
    org_company_id = ANY(public.get_user_company_ids(auth.uid()))
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    org_company_id = ANY(public.get_user_company_ids(auth.uid()))
    AND public.has_role(auth.uid(), 'admin')
  );

-- 4. Freemail helper --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_freemail_domain(d text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(d,'')) = ANY(ARRAY[
    'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','ymail.com','rocketmail.com',
    'hotmail.com','outlook.com','live.com','msn.com','aol.com',
    'icloud.com','me.com','mac.com',
    'protonmail.com','proton.me','hey.com','fastmail.com',
    'gmx.com','gmx.net','mail.com','yandex.com','zoho.com',
    'comcast.net','verizon.net','att.net','sbcglobal.net'
  ]);
$$;

-- 5. Core match function ----------------------------------------------------
-- SECURITY DEFINER so triggers + edge functions can write audit rows
-- regardless of caller RLS. Always scoped by org_company_id.
CREATE OR REPLACE FUNCTION public.run_contact_company_match(
  p_contact_id uuid,
  p_source text DEFAULT 'auto_trigger',
  p_force boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_domain text;
  v_org uuid;
  v_existing uuid;
  v_email_raw text;
  v_settings public.domain_match_settings%ROWTYPE;
  v_auto_apply boolean := true;
  v_sub boolean := false;
  v_ignored text[] := '{}';
  v_extra_free text[] := '{}';
  v_candidates uuid[] := '{}';
  v_cand_count int := 0;
  v_chosen uuid;
  v_company_website text;
  v_company_domain_norm text;
  v_decision text;
  v_status text;
  v_confidence numeric(3,2);
  v_reason text;
BEGIN
  SELECT email, email_domain_normalized, org_company_id, crm_company_id
    INTO v_email, v_domain, v_org, v_existing
  FROM public.contacts WHERE id = p_contact_id;

  IF v_org IS NULL THEN
    RETURN jsonb_build_object('skipped','no_org');
  END IF;

  v_email_raw := v_email;

  -- preserve existing link unless force
  IF v_existing IS NOT NULL AND NOT p_force THEN
    UPDATE public.contacts
       SET last_match_run_at = now()
     WHERE id = p_contact_id;
    RETURN jsonb_build_object('skipped','already_linked');
  END IF;

  IF p_force THEN
    UPDATE public.contacts SET crm_company_id = NULL WHERE id = p_contact_id;
    v_existing := NULL;
  END IF;

  -- Load per-org settings (defaults if missing)
  SELECT * INTO v_settings FROM public.domain_match_settings WHERE org_company_id = v_org;
  IF FOUND THEN
    v_auto_apply := v_settings.auto_apply;
    v_sub := v_settings.subdomain_matching;
    v_ignored := COALESCE(v_settings.ignored_domains,'{}');
    v_extra_free := COALESCE(v_settings.extra_freemail_domains,'{}');
  END IF;

  -- Extract domain ourselves so we still record freemail rather than skipping silently
  IF v_email IS NOT NULL AND position('@' in v_email) > 0 THEN
    v_domain := lower(btrim(split_part(v_email,'@',2)));
    IF v_domain = '' OR position('.' in v_domain) = 0 THEN
      v_domain := NULL;
    END IF;
  END IF;

  IF v_domain IS NULL THEN
    UPDATE public.contacts
       SET match_status='unmatched', match_confidence=0, match_source=p_source,
           last_match_run_at = now()
     WHERE id = p_contact_id;
    INSERT INTO public.contact_company_match_audit
      (org_company_id, contact_id, raw_contact_email, normalized_contact_domain, decision, reason)
      VALUES (v_org, p_contact_id, v_email_raw, NULL, 'no_match', 'no email or domain');
    RETURN jsonb_build_object('status','unmatched');
  END IF;

  -- Ignore freemail + per-org ignore lists
  IF public.is_freemail_domain(v_domain)
     OR v_domain = ANY(v_ignored)
     OR v_domain = ANY(v_extra_free) THEN
    UPDATE public.contacts
       SET match_status='ignored', match_confidence=0, match_source=p_source,
           last_match_run_at = now()
     WHERE id = p_contact_id;
    INSERT INTO public.contact_company_match_audit
      (org_company_id, contact_id, raw_contact_email, normalized_contact_domain, decision, reason)
      VALUES (v_org, p_contact_id, v_email_raw, v_domain, 'ignored',
              CASE WHEN public.is_freemail_domain(v_domain) THEN 'freemail provider'
                   WHEN v_domain = ANY(v_ignored) THEN 'org ignored domain'
                   ELSE 'extra freemail domain' END);
    RETURN jsonb_build_object('status','ignored');
  END IF;

  -- Candidate companies in same org
  SELECT COALESCE(array_agg(id ORDER BY created_at), '{}')
    INTO v_candidates
  FROM public.crm_companies
  WHERE org_company_id = v_org
    AND domain_normalized = v_domain;

  v_cand_count := COALESCE(array_length(v_candidates,1),0);

  -- Subdomain fallback if no exact match and subdomain matching enabled
  IF v_cand_count = 0 AND v_sub THEN
    SELECT COALESCE(array_agg(id ORDER BY created_at), '{}')
      INTO v_candidates
    FROM public.crm_companies
    WHERE org_company_id = v_org
      AND domain_normalized IS NOT NULL
      AND domain_normalized <> ''
      AND v_domain LIKE ('%.' || domain_normalized);
    v_cand_count := COALESCE(array_length(v_candidates,1),0);
    v_confidence := 0.80;
  ELSE
    v_confidence := 1.00;
  END IF;

  IF v_cand_count = 0 THEN
    UPDATE public.contacts
       SET match_status='unmatched', match_confidence=0, match_source=p_source,
           last_match_run_at = now()
     WHERE id = p_contact_id;
    INSERT INTO public.contact_company_match_audit
      (org_company_id, contact_id, raw_contact_email, normalized_contact_domain, decision, reason)
      VALUES (v_org, p_contact_id, v_email_raw, v_domain, 'no_match', 'no company matches domain');
    RETURN jsonb_build_object('status','unmatched');
  ELSIF v_cand_count = 1 AND v_auto_apply THEN
    v_chosen := v_candidates[1];
    SELECT website_url, domain_normalized INTO v_company_website, v_company_domain_norm
      FROM public.crm_companies WHERE id = v_chosen;
    UPDATE public.contacts
       SET crm_company_id = v_chosen,
           match_status = 'matched',
           match_confidence = v_confidence,
           match_source = p_source,
           last_match_run_at = now()
     WHERE id = p_contact_id;
    INSERT INTO public.contact_company_match_audit
      (org_company_id, contact_id, proposed_company_id, raw_contact_email, raw_company_website,
       normalized_contact_domain, normalized_company_domain, decision, reason)
      VALUES (v_org, p_contact_id, v_chosen, v_email_raw, v_company_website,
              v_domain, v_company_domain_norm, 'auto_matched',
              CASE WHEN v_confidence = 1.00 THEN 'single exact domain match'
                   ELSE 'single subdomain match' END);
    RETURN jsonb_build_object('status','matched','company_id',v_chosen);
  ELSE
    -- needs review (multi-candidate OR auto_apply=false)
    UPDATE public.contacts
       SET match_status='needs_review',
           match_confidence = CASE WHEN v_cand_count > 1 THEN 0.50 ELSE v_confidence END,
           match_source = p_source,
           last_match_run_at = now()
     WHERE id = p_contact_id;
    FOR v_chosen IN SELECT unnest(v_candidates) LOOP
      SELECT website_url, domain_normalized INTO v_company_website, v_company_domain_norm
        FROM public.crm_companies WHERE id = v_chosen;
      INSERT INTO public.contact_company_match_audit
        (org_company_id, contact_id, proposed_company_id, raw_contact_email, raw_company_website,
         normalized_contact_domain, normalized_company_domain, decision, reason)
        VALUES (v_org, p_contact_id, v_chosen, v_email_raw, v_company_website,
                v_domain, v_company_domain_norm, 'suggested',
                CASE WHEN v_cand_count > 1 THEN 'multiple domain candidates'
                     ELSE 'approval mode (auto_apply disabled)' END);
    END LOOP;
    RETURN jsonb_build_object('status','needs_review','candidates',to_jsonb(v_candidates));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.run_contact_company_match(uuid,text,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.run_contact_company_match(uuid,text,boolean) TO authenticated, service_role;

-- 6. Bulk match for an org --------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_contact_company_match(
  p_org_company_id uuid,
  p_only_unmatched boolean DEFAULT true,
  p_limit int DEFAULT 1000
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cid uuid;
  v_processed int := 0;
  v_matched int := 0;
  v_review int := 0;
  v_ignored int := 0;
  v_unmatched int := 0;
  v_res jsonb;
BEGIN
  -- caller must be a member
  IF NOT (p_org_company_id = ANY(public.get_user_company_ids(auth.uid())))
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  FOR v_cid IN
    SELECT id FROM public.contacts
     WHERE org_company_id = p_org_company_id
       AND (NOT p_only_unmatched OR crm_company_id IS NULL)
     ORDER BY created_at DESC
     LIMIT p_limit
  LOOP
    v_res := public.run_contact_company_match(v_cid, 'bulk_resync', false);
    v_processed := v_processed + 1;
    CASE v_res->>'status'
      WHEN 'matched' THEN v_matched := v_matched + 1;
      WHEN 'needs_review' THEN v_review := v_review + 1;
      WHEN 'ignored' THEN v_ignored := v_ignored + 1;
      WHEN 'unmatched' THEN v_unmatched := v_unmatched + 1;
      ELSE NULL;
    END CASE;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'matched', v_matched,
    'needs_review', v_review,
    'ignored', v_ignored,
    'unmatched', v_unmatched
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_contact_company_match(uuid,boolean,int) FROM public;
GRANT EXECUTE ON FUNCTION public.bulk_contact_company_match(uuid,boolean,int) TO authenticated, service_role;

-- 7. Replace Blount-specific triggers with org-agnostic ones ----------------
DROP TRIGGER IF EXISTS trg_blount_contact_autolink ON public.contacts;
DROP TRIGGER IF EXISTS trg_blount_company_autolink ON public.crm_companies;

CREATE OR REPLACE FUNCTION public.tg_contacts_autolink()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_company_id IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.run_contact_company_match(NEW.id, 'auto_trigger', false);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.email IS DISTINCT FROM OLD.email
       OR NEW.email_domain_normalized IS DISTINCT FROM OLD.email_domain_normalized THEN
      IF NEW.crm_company_id IS NULL THEN
        PERFORM public.run_contact_company_match(NEW.id, 'auto_trigger', false);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_autolink ON public.contacts;
CREATE TRIGGER trg_contacts_autolink
AFTER INSERT OR UPDATE OF email, email_domain_normalized
ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.tg_contacts_autolink();

CREATE OR REPLACE FUNCTION public.tg_companies_autolink_contacts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cid uuid;
BEGIN
  IF NEW.org_company_id IS NULL OR NEW.domain_normalized IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.domain_normalized IS NOT DISTINCT FROM OLD.domain_normalized THEN
    RETURN NEW;
  END IF;
  FOR v_cid IN
    SELECT id FROM public.contacts
     WHERE org_company_id = NEW.org_company_id
       AND crm_company_id IS NULL
       AND (email_domain_normalized = NEW.domain_normalized
            OR lower(split_part(coalesce(email,''),'@',2)) = NEW.domain_normalized)
     LIMIT 500
  LOOP
    PERFORM public.run_contact_company_match(v_cid, 'auto_trigger', false);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_autolink_contacts ON public.crm_companies;
CREATE TRIGGER trg_companies_autolink_contacts
AFTER INSERT OR UPDATE OF domain_normalized
ON public.crm_companies
FOR EACH ROW EXECUTE FUNCTION public.tg_companies_autolink_contacts();

-- 8. Backfill ---------------------------------------------------------------
-- Touch normalized fields where missing
UPDATE public.contacts
   SET email = email
 WHERE email IS NOT NULL AND email_domain_normalized IS NULL
   AND position('@' in email) > 0;

UPDATE public.crm_companies
   SET domain = domain
 WHERE domain_normalized IS NULL AND (website_url IS NOT NULL OR domain IS NOT NULL);

-- Backfill matches for unlinked contacts (preserves existing links)
DO $$
DECLARE
  v_cid uuid;
BEGIN
  FOR v_cid IN
    SELECT c.id
      FROM public.contacts c
     WHERE c.crm_company_id IS NULL
       AND c.org_company_id IS NOT NULL
       AND c.email IS NOT NULL
       AND position('@' in c.email) > 0
     LIMIT 200000
  LOOP
    PERFORM public.run_contact_company_match(v_cid, 'bulk_resync', false);
  END LOOP;
END $$;

-- Mark already-linked contacts as matched for clean dashboard state
UPDATE public.contacts
   SET match_status = 'matched',
       match_confidence = COALESCE(match_confidence, 1.00),
       match_source = COALESCE(match_source, 'pre_existing')
 WHERE crm_company_id IS NOT NULL
   AND match_status = 'unmatched';
