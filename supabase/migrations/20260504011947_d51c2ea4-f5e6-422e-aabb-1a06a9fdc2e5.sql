-- usage_events: lightweight per-action log powering Admin Usage Analytics
CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid,
  feature_type text NOT NULL,
  feature_subtype text,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  session_id text,
  deal_id uuid,
  token_count integer,
  duration_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_ts ON public.usage_events (user_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_company_ts ON public.usage_events (company_id, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_feature_ts ON public.usage_events (feature_type, "timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_deal ON public.usage_events (deal_id) WHERE deal_id IS NOT NULL;

-- Auto-fill company_id from the user's workspace if caller didn't supply it
CREATE TRIGGER usage_events_set_company_id
BEFORE INSERT ON public.usage_events
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can log their own events
CREATE POLICY "Users insert own usage events"
ON public.usage_events FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can read events from their own workspaces
CREATE POLICY "Users read own workspace usage events"
ON public.usage_events FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (company_id IS NOT NULL AND company_id = ANY (public.get_user_company_ids(auth.uid())))
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);
