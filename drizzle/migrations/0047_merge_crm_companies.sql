CREATE OR REPLACE FUNCTION public.merge_crm_companies(p_primary_id uuid, p_duplicate_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_ids uuid[];
  v_bad int;
  v_domains text[];
  v_tags text[];
  v_notes text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  v_ids := array(SELECT DISTINCT unnest(p_duplicate_ids) EXCEPT SELECT p_primary_id);
  IF coalesce(array_length(v_ids,1),0) = 0 THEN RAISE EXCEPTION 'No duplicates to merge'; END IF;

  SELECT org_company_id INTO v_org FROM crm_companies WHERE id = p_primary_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Primary company not found'; END IF;

  SELECT count(*) INTO v_bad FROM crm_companies c
  WHERE c.id = ANY(v_ids || p_primary_id)
    AND NOT (
      c.org_company_id IS NOT DISTINCT FROM v_org
      AND (is_5thline_user(v_uid) OR c.org_company_id IN (SELECT company_id FROM company_members WHERE user_id = v_uid))
    );
  IF v_bad > 0 OR (SELECT count(*) FROM crm_companies WHERE id = ANY(v_ids)) <> array_length(v_ids,1) THEN
    RAISE EXCEPTION 'Not allowed to merge these companies' USING ERRCODE = '42501';
  END IF;

  -- consolidate domains, tags, notes
  SELECT array(SELECT DISTINCT d FROM (
      SELECT lower(trim(unnest(coalesce(additional_domains,'{}')))) d FROM crm_companies WHERE id = ANY(v_ids || p_primary_id)
      UNION SELECT lower(trim(domain)) FROM crm_companies WHERE id = ANY(v_ids) AND domain IS NOT NULL
    ) s WHERE d IS NOT NULL AND d <> '' AND d <> coalesce(lower(trim((SELECT domain FROM crm_companies WHERE id=p_primary_id))),'')),
    array(SELECT DISTINCT t FROM (SELECT unnest(coalesce(tags,'{}')) t FROM crm_companies WHERE id = ANY(v_ids || p_primary_id)) s WHERE t IS NOT NULL AND t <> ''),
    string_agg('[Merged from ' || name || ']: ' || notes, E'\n\n') FILTER (WHERE notes IS NOT NULL AND trim(notes) <> '')
  INTO v_domains, v_tags, v_notes
  FROM crm_companies WHERE id = ANY(v_ids);

  UPDATE crm_companies SET
    additional_domains = v_domains,
    tags = v_tags,
    notes = CASE WHEN v_notes IS NULL THEN notes ELSE concat_ws(E'\n\n', nullif(notes,''), v_notes) END,
    updated_at = now()
  WHERE id = p_primary_id;

  -- relink children (drop rows that would violate uniqueness first)
  DELETE FROM channel_partners cp WHERE cp.crm_company_id = ANY(v_ids)
    AND EXISTS (SELECT 1 FROM channel_partners x WHERE x.company_id = cp.company_id AND x.crm_company_id = p_primary_id);
  DELETE FROM channel_partners cp WHERE cp.crm_company_id = ANY(v_ids)
    AND cp.id <> (SELECT min(x.id::text)::uuid FROM channel_partners x WHERE x.company_id = cp.company_id AND x.crm_company_id = ANY(v_ids));
  UPDATE channel_partners SET crm_company_id = p_primary_id WHERE crm_company_id = ANY(v_ids);

  DELETE FROM crm_company_team t WHERE t.crm_company_id = ANY(v_ids)
    AND EXISTS (SELECT 1 FROM crm_company_team x WHERE x.user_id = t.user_id AND (x.crm_company_id = p_primary_id OR (x.crm_company_id = ANY(v_ids) AND x.id::text < t.id::text)));
  UPDATE crm_company_team SET crm_company_id = p_primary_id WHERE crm_company_id = ANY(v_ids);

  DELETE FROM deal_related_parties r WHERE r.crm_company_id = ANY(v_ids)
    AND EXISTS (SELECT 1 FROM deal_related_parties x WHERE x.deal_id = r.deal_id AND (x.crm_company_id = p_primary_id OR (x.crm_company_id = ANY(v_ids) AND x.id::text < r.id::text)));
  UPDATE deal_related_parties SET crm_company_id = p_primary_id WHERE crm_company_id = ANY(v_ids);

  DELETE FROM channel_entries e WHERE e.crm_company_id = ANY(v_ids)
    AND EXISTS (SELECT 1 FROM channel_entries x WHERE x.company_id = e.company_id
      AND x.contact_id IS NOT DISTINCT FROM e.contact_id
      AND (x.crm_company_id = p_primary_id OR (x.crm_company_id = ANY(v_ids) AND x.id::text < e.id::text)));
  UPDATE channel_entries SET crm_company_id = p_primary_id WHERE crm_company_id = ANY(v_ids);

  UPDATE contacts SET crm_company_id = p_primary_id WHERE crm_company_id = ANY(v_ids);
  UPDATE deals SET crm_company_id = p_primary_id WHERE crm_company_id = ANY(v_ids);
  UPDATE deals SET referred_by_crm_company_id = p_primary_id WHERE referred_by_crm_company_id = ANY(v_ids);
  UPDATE tasks SET crm_company_id = p_primary_id WHERE crm_company_id = ANY(v_ids);
  UPDATE master_lenders SET crm_company_id = p_primary_id WHERE crm_company_id = ANY(v_ids);
  UPDATE crm_company_activities SET crm_company_id = p_primary_id WHERE crm_company_id = ANY(v_ids);
  UPDATE crm_company_attachments SET crm_company_id = p_primary_id WHERE crm_company_id = ANY(v_ids);
  UPDATE claap_meetings SET matched_crm_company_id = p_primary_id WHERE matched_crm_company_id = ANY(v_ids);
  UPDATE crm_companies SET parent_company_id = p_primary_id WHERE parent_company_id = ANY(v_ids) AND id <> p_primary_id;
  UPDATE crm_companies SET parent_company_id = NULL WHERE id = p_primary_id AND parent_company_id = ANY(v_ids);

  DELETE FROM crm_companies WHERE id = ANY(v_ids);

  RETURN jsonb_build_object('primary_id', p_primary_id, 'merged', array_length(v_ids,1));
END;
$$;

REVOKE ALL ON FUNCTION public.merge_crm_companies(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_crm_companies(uuid, uuid[]) TO authenticated;