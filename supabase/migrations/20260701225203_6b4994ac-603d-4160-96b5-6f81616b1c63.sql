DO $$
DECLARE r RECORD; suffix TEXT; pretty TEXT; raw TEXT; token TEXT; parts TEXT[]; out_tokens TEXT[]; acr TEXT[]; new_title TEXT;
BEGIN
  acr := ARRAY['drl','dm','ioi','loi','lp','gp','vc','pe','dd','kyc','kpi','mrr','arr','sla','poc','rfp','rfi','nda','msa','sow','po','qbr','cfo','ceo','cto','coo','cro','cmo','vp','svp','evp','us','usa','uk','eu','ai','api','sdk','sql','erp','crm','hr','it','io','saas','paas','iaas','b2b','b2c','tam','sam','som','yoy','mom','qoq','ytd','mtd','qtd','ebit','ebitda','ltv','cac'];
  FOR r IN
    SELECT id, title FROM public.ai_action_queue
    WHERE status = 'pending' AND title ~ 'to "[^"]*[-_][^"]*"'
  LOOP
    raw := substring(r.title from 'to "([^"]+)"');
    IF raw IS NULL THEN CONTINUE; END IF;
    parts := regexp_split_to_array(regexp_replace(raw, '[_-]+', ' ', 'g'), '\s+');
    out_tokens := ARRAY[]::TEXT[];
    FOREACH token IN ARRAY parts LOOP
      IF token = '' THEN CONTINUE; END IF;
      IF lower(token) = ANY(acr) THEN
        out_tokens := out_tokens || upper(token);
      ELSE
        out_tokens := out_tokens || (upper(substring(token,1,1)) || lower(substring(token,2)));
      END IF;
    END LOOP;
    pretty := array_to_string(out_tokens, ' ');
    new_title := regexp_replace(r.title, 'to "[^"]+"', 'to "' || pretty || '"');
    IF new_title <> r.title THEN
      UPDATE public.ai_action_queue SET title = new_title WHERE id = r.id;
    END IF;
  END LOOP;
END $$;