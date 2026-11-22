CREATE TABLE public.master_plan_mcp_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, user_id uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('targets','headcount')), cell_key text NOT NULL, period text NOT NULL, before_value numeric, after_value numeric, change_reason text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT ON public.master_plan_mcp_audit TO authenticated;
GRANT ALL ON public.master_plan_mcp_audit TO service_role;
ALTER TABLE public.master_plan_mcp_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY master_plan_audit_read ON public.master_plan_mcp_audit FOR SELECT TO authenticated USING (user_id=auth.uid() AND company_id='44556c46-9127-4b12-b14e-d6fee784afcf' AND EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id=auth.uid() AND cm.company_id=master_plan_mcp_audit.company_id));
CREATE POLICY master_plan_audit_insert ON public.master_plan_mcp_audit FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid() AND company_id='44556c46-9127-4b12-b14e-d6fee784afcf' AND lower(coalesce(auth.jwt()->>'email','')) IN ('jturner@5thline.co','jmoffitt@5thline.co','ffustinoni@5thline.co') AND EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id=auth.uid() AND cm.company_id=master_plan_mcp_audit.company_id));
CREATE INDEX master_plan_mcp_audit_user_time ON public.master_plan_mcp_audit(company_id,user_id,created_at DESC);
CREATE FUNCTION public.mcp_write_master_plan(p_kind text,p_updates jsonb,p_dry_run boolean DEFAULT true,p_confirm boolean DEFAULT false,p_reason text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE workspace uuid:='44556c46-9127-4b12-b14e-d6fee784afcf'; item jsonb; k text; p text; v numeric; old_value numeric; label text; existing_id uuid; results jsonb:='[]'::jsonb; changed integer:=0; status text; seen text[]:=ARRAY[]::text[];
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.company_members WHERE user_id=auth.uid() AND company_id=workspace) OR lower(coalesce(auth.jwt()->>'email','')) NOT IN ('jturner@5thline.co','jmoffitt@5thline.co','ffustinoni@5thline.co') THEN RAISE EXCEPTION 'Master Plan editor access required' USING ERRCODE='42501'; END IF;
 IF p_dry_run IS NULL OR p_confirm IS NULL OR (NOT p_dry_run AND NOT p_confirm) THEN RAISE EXCEPTION 'Explicit approval is required'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('targets','headcount') THEN RAISE EXCEPTION 'Invalid write kind'; END IF;
 IF jsonb_typeof(p_updates) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'updates must be an array'; END IF;
 IF jsonb_array_length(p_updates)<1 OR jsonb_array_length(p_updates)>(CASE WHEN p_kind='targets' THEN 2000 ELSE 96 END) THEN RAISE EXCEPTION 'Invalid batch size'; END IF;
 IF length(p_reason)>1000 THEN RAISE EXCEPTION 'Reason is too long'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('master-plan:'||workspace::text,0));
 FOR item IN SELECT value FROM jsonb_array_elements(p_updates) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT (item ? 'value') OR jsonb_typeof(item->'value') NOT IN ('number','null') THEN RAISE EXCEPTION 'Each cell must have a numeric or null value'; END IF;
  v:=(item->>'value')::numeric;
  IF v IS NOT NULL AND v::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Finite values required'; END IF;
  k:=CASE WHEN p_kind='targets' THEN item->>'metric_key' ELSE item->>'realm_id' END;
  p:=CASE WHEN p_kind='targets' THEN item->>'period' ELSE item->>'month' END;
  IF k IS NULL OR p IS NULL THEN RAISE EXCEPTION 'Cell key and period required'; END IF;
  IF (k||'|'||p)=ANY(seen) THEN RAISE EXCEPTION 'Duplicate cell in batch'; END IF;
  seen:=array_append(seen,k||'|'||p); existing_id:=NULL; old_value:=NULL;
  IF p_kind='targets' THEN
   IF p !~ '^202[78]-(0[1-9]|1[0-2]|Q[1-4])$' THEN RAISE EXCEPTION 'Invalid plan period'; END IF;
   IF k !~ '^plan:financials:(consolidated|finserv|debt):(revenue|gross-margin|gross-margin-pct|total-opex|total-firm-expenses|net-operating-income|margin-pct)$' AND k !~ '^plan:(finserv-financial-metrics|consolidated-debt-pipeline|sales-dashboard-v2|sales-bd-roi):[a-z][a-z0-9-]{0,99}$' THEN RAISE EXCEPTION 'Invalid Master Plan metric key'; END IF;
   label:=item->>'metric_label'; IF label IS NULL OR length(label)>300 THEN RAISE EXCEPTION 'Metric label required'; END IF;
   SELECT id,target_value INTO existing_id,old_value FROM public.insights_metric_targets WHERE company_id=workspace AND metric_key=k AND period_month=p FOR UPDATE;
  ELSE
   IF p !~ '^202[78]-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Headcount requires a monthly period'; END IF;
   IF k NOT IN ('193514877331929','9341451968897660','9130350272677286','123146077561874') THEN RAISE EXCEPTION 'Invalid Headcount entity'; END IF;
   IF v IS NOT NULL AND (v<0 OR v>9999.99 OR v<>round(v,2)) THEN RAISE EXCEPTION 'Headcount must be 0 to 9999.99 with two decimal places'; END IF;
   SELECT id,headcount INTO existing_id,old_value FROM public.monthly_entity_headcount WHERE company_id=workspace AND realm_id=k AND month=(p||'-01')::date FOR UPDATE;
  END IF;
  IF old_value IS NOT DISTINCT FROM v THEN status:='unchanged';
  ELSE
   changed:=changed+1;
   status:=CASE WHEN p_dry_run THEN CASE WHEN v IS NULL THEN 'would_clear' ELSE 'would_update' END ELSE CASE WHEN v IS NULL THEN 'cleared' ELSE 'updated' END END;
   IF NOT p_dry_run THEN
    IF p_kind='targets' THEN
     IF v IS NULL THEN DELETE FROM public.insights_metric_targets WHERE id=existing_id AND company_id=workspace;
     ELSE INSERT INTO public.insights_metric_targets(company_id,owner_user_id,metric_key,metric_label,period_month,target_value) VALUES(workspace,auth.uid(),k,label,p,v) ON CONFLICT(company_id,metric_key,period_month) DO UPDATE SET target_value=excluded.target_value,metric_label=excluded.metric_label,updated_at=now(); END IF;
    ELSE
     INSERT INTO public.monthly_entity_headcount(company_id,realm_id,month,headcount,updated_by) VALUES(workspace,k,(p||'-01')::date,v,auth.uid()) ON CONFLICT(company_id,realm_id,month) DO UPDATE SET headcount=excluded.headcount,updated_by=auth.uid(),updated_at=now();
    END IF;
    INSERT INTO public.master_plan_mcp_audit(company_id,user_id,kind,cell_key,period,before_value,after_value,change_reason) VALUES(workspace,auth.uid(),p_kind,k,p,old_value,v,p_reason);
   END IF;
  END IF;
  results:=results||jsonb_build_array(jsonb_build_object('cell_key',k,'period',p,'before',old_value,'after',v,'status',status));
 END LOOP;
 RETURN jsonb_build_object('dry_run',p_dry_run,'updated',CASE WHEN p_dry_run THEN 0 ELSE changed END,'would_update',CASE WHEN p_dry_run THEN changed ELSE 0 END,'unchanged',jsonb_array_length(p_updates)-changed,'cells',results);
END $$;
REVOKE ALL ON FUNCTION public.mcp_write_master_plan(text,jsonb,boolean,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mcp_write_master_plan(text,jsonb,boolean,boolean,text) TO authenticated,service_role;