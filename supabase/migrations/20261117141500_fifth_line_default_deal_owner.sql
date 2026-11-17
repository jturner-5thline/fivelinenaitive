CREATE OR REPLACE FUNCTION public.default_fifth_line_deal_people()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.company_id = '44556c46-9127-4b12-b14e-d6fee784afcf'::uuid THEN
    IF NEW.deal_owner IS NULL OR btrim(NEW.deal_owner) = '' THEN NEW.deal_owner := 'James Turner'; END IF;
    IF NEW.manager IS NULL OR btrim(NEW.manager) = '' THEN NEW.manager := 'James Turner'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.default_fifth_line_deal_people() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS trg_default_fifth_line_deal_people ON public.deals;
CREATE TRIGGER trg_default_fifth_line_deal_people BEFORE INSERT ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.default_fifth_line_deal_people();
