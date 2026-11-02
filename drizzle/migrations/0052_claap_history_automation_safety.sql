CREATE OR REPLACE FUNCTION public.trigger_detect_sales_call_deals_on_claap() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.source_payload->>'funding_history_import'='true' THEN RETURN NEW; END IF;
 PERFORM net.http_post(url:='https://tgkksvazruzbghssnxde.supabase.co/functions/v1/detect-sales-call-deals',headers:=jsonb_build_object('Content-Type','application/json','x-internal-cron-secret',public.internal_function_secret()),body:=jsonb_build_object('lookback_minutes',1440,'trigger','claap_recording_sync','claap_recording_id',NEW.id));
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.claap_funding_content_enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.claap_funding_backfill_jobs(company_id,phase,status,window_start,window_end)
 SELECT NEW.org_company_id,'content','running',now(),now() WHERE EXISTS(SELECT 1 FROM public.claap_integration_config c WHERE c.company_id=NEW.org_company_id AND c.is_active)
 ON CONFLICT(company_id) DO UPDATE SET window_end=greatest(claap_funding_backfill_jobs.window_end,NEW.started_at,now()),status=CASE WHEN claap_funding_backfill_jobs.status='complete' THEN 'running' ELSE claap_funding_backfill_jobs.status END,phase=CASE WHEN claap_funding_backfill_jobs.phase='complete' THEN 'content' ELSE claap_funding_backfill_jobs.phase END;
 RETURN NEW;
END $$;
CREATE TRIGGER claap_funding_content_enqueue AFTER INSERT ON public.claap_recordings FOR EACH ROW EXECUTE FUNCTION public.claap_funding_content_enqueue();