DROP TRIGGER IF EXISTS trigger_auto_sync_lender_to_flex ON public.master_lenders;
DROP TRIGGER IF EXISTS deals_flex_auto_remove ON public.deals;
DO $$
DECLARE j record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    FOR j IN SELECT jobid FROM cron.job WHERE command ILIKE '%flex%' OR jobname ILIKE '%flex%' LOOP
      PERFORM cron.unschedule(j.jobid);
    END LOOP;
  END IF;
END $$;
COMMENT ON FUNCTION public.auto_sync_lender_to_flex() IS 'DEPRECATED: FLEx integration disconnected; trigger removed.';