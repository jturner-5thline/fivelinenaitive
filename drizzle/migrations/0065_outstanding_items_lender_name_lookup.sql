DO $$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.mcp_write_outstanding_item(text,uuid,uuid,jsonb)'::regprocedure) INTO definition;
 IF position('SELECT lender_name INTO requester FROM public.deal_lenders' in definition)=0 THEN RAISE EXCEPTION 'Unexpected Open Items writer definition'; END IF;
 EXECUTE replace(definition,'SELECT lender_name INTO requester FROM public.deal_lenders','SELECT name INTO requester FROM public.deal_lenders');
END $$;