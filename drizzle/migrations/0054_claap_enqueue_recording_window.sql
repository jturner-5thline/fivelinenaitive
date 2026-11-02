CREATE OR REPLACE FUNCTION public.claap_funding_content_enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.claap_funding_backfill_jobs(company_id,phase,status,window_start,window_end)
 SELECT NEW.org_company_id,'content','running',coalesce(NEW.started_at,now()),now() WHERE EXISTS(SELECT 1 FROM public.claap_integration_config c WHERE c.company_id=NEW.org_company_id AND c.is_active)
 ON CONFLICT(company_id) DO UPDATE SET window_start=least(claap_funding_backfill_jobs.window_start,coalesce(NEW.started_at,now())),window_end=greatest(claap_funding_backfill_jobs.window_end,NEW.started_at,now()),status=CASE WHEN claap_funding_backfill_jobs.status='complete' THEN 'running' ELSE claap_funding_backfill_jobs.status END,phase=CASE WHEN claap_funding_backfill_jobs.phase='complete' THEN 'content' ELSE claap_funding_backfill_jobs.phase END;
 RETURN NEW;
END $$;