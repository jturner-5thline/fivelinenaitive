
CREATE OR REPLACE FUNCTION public.auto_link_blount_deal_to_crm_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blount_id CONSTANT uuid := 'c4753066-0da9-4d87-8858-7eb1adecd173';
  v_match_count int;
  v_matched_id uuid;
  v_norm text;
BEGIN
  IF NEW.company_id IS DISTINCT FROM blount_id THEN RETURN NEW; END IF;
  IF NEW.crm_company_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.company IS NULL OR btrim(NEW.company) = '' THEN RETURN NEW; END IF;

  v_norm := lower(btrim(NEW.company));

  SELECT COUNT(*)::int INTO v_match_count
  FROM public.crm_companies
  WHERE org_company_id = blount_id
    AND lower(btrim(name)) = v_norm;

  IF v_match_count = 1 THEN
    SELECT id INTO v_matched_id
    FROM public.crm_companies
    WHERE org_company_id = blount_id
      AND lower(btrim(name)) = v_norm
    LIMIT 1;
    NEW.crm_company_id := v_matched_id;
    RAISE NOTICE '[blount-autolink] linked deal % ("%") -> crm_company %', NEW.id, NEW.company, v_matched_id;
  ELSIF v_match_count > 1 THEN
    RAISE NOTICE '[blount-autolink] SKIP ambiguous deal % ("%"): % candidates', NEW.id, NEW.company, v_match_count;
  END IF;

  RETURN NEW;
END;
$$;
