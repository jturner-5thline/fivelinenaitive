
-- Enum for pilot KPI event types
DO $$ BEGIN
  CREATE TYPE public.pilot_kpi_event_type AS ENUM (
    'deal_created','initial_login','session_heartbeat','visit',
    'feedback_given','feedback_call_attended','demo_converted','pilot_converted'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Event log table
CREATE TABLE IF NOT EXISTS public.pilot_kpi_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id       UUID,
  event_type    public.pilot_kpi_event_type NOT NULL,
  deal_id       UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pke_company_time ON public.pilot_kpi_events(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pke_deal         ON public.pilot_kpi_events(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pke_type_time    ON public.pilot_kpi_events(event_type, occurred_at DESC);

ALTER TABLE public.pilot_kpi_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pke_admin_select_same_company" ON public.pilot_kpi_events;
CREATE POLICY "pke_admin_select_same_company" ON public.pilot_kpi_events
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND company_id = ANY (public.get_user_company_ids(auth.uid()))
  );

-- Deal link table
CREATE TABLE IF NOT EXISTS public.deal_kpi_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  kpi_event_id  UUID NOT NULL REFERENCES public.pilot_kpi_events(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, kpi_event_id)
);
CREATE INDEX IF NOT EXISTS idx_dkl_deal ON public.deal_kpi_links(deal_id);

ALTER TABLE public.deal_kpi_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dkl_admin_select_same_company" ON public.deal_kpi_links;
CREATE POLICY "dkl_admin_select_same_company" ON public.deal_kpi_links
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_kpi_links.deal_id
        AND d.company_id = ANY (public.get_user_company_ids(auth.uid()))
    )
  );

-- Feature flag (disabled by default; enable manually for 5th Line if/when ready)
INSERT INTO public.feature_flags (name, description, status)
VALUES ('ff_pilot_kpi_tracking', 'Enables pilot KPI tracking (heartbeat, login, visit, demo-converted events)', 'disabled')
ON CONFLICT (name) DO NOTHING;
