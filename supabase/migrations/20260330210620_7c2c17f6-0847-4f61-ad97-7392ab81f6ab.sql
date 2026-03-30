
-- 1. hubspot_pipeline_stage_map: maps nAItive pipeline+stage to HubSpot pipeline+dealstage IDs
CREATE TABLE public.hubspot_pipeline_stage_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  naitive_pipeline_id UUID NOT NULL REFERENCES public.deal_pipelines(id) ON DELETE CASCADE,
  naitive_stage_name TEXT NOT NULL,
  hubspot_pipeline_id TEXT NOT NULL,
  hubspot_dealstage_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, naitive_pipeline_id, naitive_stage_name)
);

ALTER TABLE public.hubspot_pipeline_stage_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view mappings"
  ON public.hubspot_pipeline_stage_map FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Company admins can manage mappings"
  ON public.hubspot_pipeline_stage_map FOR ALL TO authenticated
  USING (public.is_company_admin(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin(auth.uid(), company_id));

-- 2. hubspot_sync_logs: logs push results
CREATE TABLE public.hubspot_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  hubspot_deal_id TEXT,
  direction TEXT NOT NULL DEFAULT 'naitive_to_hubspot',
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.hubspot_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view sync logs"
  ON public.hubspot_sync_logs FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

-- Service role only for inserts (edge function)
CREATE POLICY "Service role can insert sync logs"
  ON public.hubspot_sync_logs FOR INSERT TO service_role
  WITH CHECK (true);

-- 3. Trigger on deals for pipeline_id or stage changes
CREATE OR REPLACE FUNCTION public.notify_hubspot_deal_stage_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  -- Only fire when pipeline_id or stage actually changed
  IF (OLD.pipeline_id IS DISTINCT FROM NEW.pipeline_id) OR (OLD.stage IS DISTINCT FROM NEW.stage) THEN
    -- Only push if deal is linked to HubSpot
    IF NEW.hubspot_deal_id IS NOT NULL AND NEW.hubspot_deal_id != '' THEN
      PERFORM net.http_post(
        url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/hubspot-deal-stage-push',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'deal_id', NEW.id,
          'pipeline_id', NEW.pipeline_id,
          'stage', NEW.stage,
          'hubspot_deal_id', NEW.hubspot_deal_id,
          'company_id', NEW.company_id
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_hubspot_deal_stage_push
  AFTER UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hubspot_deal_stage_change();
