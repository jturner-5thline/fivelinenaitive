
CREATE TABLE public.asana_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  asana_project_gid TEXT NOT NULL,
  asana_webhook_gid TEXT,
  webhook_secret TEXT,
  target_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(integration_id, asana_project_gid)
);

ALTER TABLE public.asana_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view asana webhooks"
  ON public.asana_webhooks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage asana webhooks"
  ON public.asana_webhooks FOR ALL TO authenticated USING (true) WITH CHECK (true);
