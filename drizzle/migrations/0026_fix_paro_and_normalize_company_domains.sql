
-- Additive: helper to merge one CRM company into another (source -> target).
CREATE OR REPLACE FUNCTION public.merge_crm_companies(p_source uuid, p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_source = p_target THEN RETURN; END IF;
  UPDATE public.tasks                    SET crm_company_id = p_target WHERE crm_company_id = p_source;
  UPDATE public.channel_entries          SET crm_company_id = p_target WHERE crm_company_id = p_source;
  UPDATE public.crm_company_activities   SET crm_company_id = p_target WHERE crm_company_id = p_source;
  UPDATE public.crm_company_attachments  SET crm_company_id = p_target WHERE crm_company_id = p_source;
  UPDATE public.contacts                 SET crm_company_id = p_target WHERE crm_company_id = p_source;
  UPDATE public.deals                    SET crm_company_id = p_target WHERE crm_company_id = p_source;
  UPDATE public.deals                    SET referred_by_crm_company_id = p_target WHERE referred_by_crm_company_id = p_source;
  UPDATE public.master_lenders           SET crm_company_id = p_target WHERE crm_company_id = p_source;
  UPDATE public.crm_companies            SET parent_company_id = p_target WHERE parent_company_id = p_source;
  DELETE FROM public.crm_company_team    WHERE crm_company_id = p_source;
  DELETE FROM public.crm_companies       WHERE id = p_source;
END;
$$;

-- Backfill: recompute domain_normalized for any rows out of sync with normalize_website_domain(domain).
UPDATE public.crm_companies
   SET domain_normalized = public.normalize_website_domain(domain)
 WHERE domain IS NOT NULL
   AND domain_normalized IS DISTINCT FROM public.normalize_website_domain(domain);

-- Backfill: merge the duplicate native Paro record into the HubSpot Paro record that holds all contacts, calls, and history.
SELECT public.merge_crm_companies(
  'f0e93f6f-f5a1-4283-a89e-d4f855bc5833'::uuid,
  '620644b9-30a6-4634-b336-01ccf809d1b6'::uuid
);

-- Backfill: link the Paro deal (previously unlinked) to the surviving Paro company.
UPDATE public.deals
   SET crm_company_id = '620644b9-30a6-4634-b336-01ccf809d1b6'::uuid
 WHERE id = 'b624a054-74ae-4a71-a74d-e59062e85863'::uuid
   AND crm_company_id IS NULL;

-- Backfill: re-run contact->company matching for currently unlinked contacts in orgs
-- where the domain now resolves to a single company (thanks to normalization + merge above).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.id
      FROM public.contacts c
      JOIN public.crm_companies comp
        ON comp.org_company_id = c.org_company_id
       AND comp.domain_normalized = c.email_domain_normalized
     WHERE c.crm_company_id IS NULL
       AND c.email_domain_normalized IS NOT NULL
       AND NOT public.is_freemail_domain(c.email_domain_normalized)
     GROUP BY c.id
    HAVING count(DISTINCT comp.id) = 1
  LOOP
    PERFORM public.run_contact_company_match(r.id, 'domain_repair_backfill', false);
  END LOOP;
END $$;
