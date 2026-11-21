GRANT EXECUTE ON FUNCTION public.validate_qualifier_groups(jsonb) TO service_role;
CREATE FUNCTION public.check_qualifier_group_consistency() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE record jsonb; criteria jsonb; target uuid;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.deal_id ELSE NEW.deal_id END;
 SELECT to_jsonb(a) INTO record FROM public.deal_qualifier_agreements a WHERE a.deal_id=target;
 SELECT coalesce(jsonb_agg(jsonb_build_object('group',q."group")),'[]'::jsonb) INTO criteria FROM public.deal_qualifiers q WHERE q.deal_id=target;
 IF record IS NULL THEN record:='{}'::jsonb; END IF;
 PERFORM public.validate_qualifier_groups(record||jsonb_build_object('criteria',criteria));
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER qualifier_agreement_group_consistency AFTER INSERT OR UPDATE OR DELETE ON public.deal_qualifier_agreements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_qualifier_group_consistency();
CREATE CONSTRAINT TRIGGER qualifier_criterion_group_consistency AFTER INSERT OR UPDATE OR DELETE ON public.deal_qualifiers DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_qualifier_group_consistency();