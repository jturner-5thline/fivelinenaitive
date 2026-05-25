
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
  -- Only Blount Capital tenant, only when no link already exists, only with a name
  IF NEW.company_id IS DISTINCT FROM blount_id THEN
    RETURN NEW;
  END IF;
  IF NEW.crm_company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.company IS NULL OR btrim(NEW.company) = '' THEN
    RETURN NEW;
  END IF;

  v_norm := lower(btrim(NEW.company));

  SELECT COUNT(*), MIN(id)
    INTO v_match_count, v_matched_id
  FROM public.crm_companies
  WHERE org_company_id = blount_id
    AND lower(btrim(name)) = v_norm;

  IF v_match_count = 1 THEN
    NEW.crm_company_id := v_matched_id;
    RAISE NOTICE '[blount-autolink] linked deal % ("%") -> crm_company %', NEW.id, NEW.company, v_matched_id;
  ELSIF v_match_count > 1 THEN
    RAISE NOTICE '[blount-autolink] SKIP ambiguous deal % ("%"): % candidates', NEW.id, NEW.company, v_match_count;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_blount_deal_insert ON public.deals;
CREATE TRIGGER trg_auto_link_blount_deal_insert
BEFORE INSERT ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.auto_link_blount_deal_to_crm_company();

DROP TRIGGER IF EXISTS trg_auto_link_blount_deal_update ON public.deals;
CREATE TRIGGER trg_auto_link_blount_deal_update
BEFORE UPDATE OF company, crm_company_id, company_id ON public.deals
FOR EACH ROW
WHEN (NEW.crm_company_id IS NULL)
EXECUTE FUNCTION public.auto_link_blount_deal_to_crm_company();
