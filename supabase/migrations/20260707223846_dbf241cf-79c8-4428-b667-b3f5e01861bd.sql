
CREATE TABLE public.event_claap_match_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_company_id UUID NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','approved','rejected','none')),
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  recording_id TEXT,
  recording_title TEXT,
  recording_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  recorder_name TEXT,
  recorder_email TEXT,
  recorded_at TIMESTAMPTZ,
  score NUMERIC,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_company_id, event_id)
);

CREATE INDEX idx_event_claap_match_cache_event ON public.event_claap_match_cache (org_company_id, event_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_claap_match_cache TO authenticated;
GRANT ALL ON public.event_claap_match_cache TO service_role;

ALTER TABLE public.event_claap_match_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view event claap match cache"
  ON public.event_claap_match_cache FOR SELECT
  USING (public.is_company_member(auth.uid(), org_company_id));

CREATE POLICY "Members can insert event claap match cache"
  ON public.event_claap_match_cache FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), org_company_id));

CREATE POLICY "Members can update event claap match cache"
  ON public.event_claap_match_cache FOR UPDATE
  USING (public.is_company_member(auth.uid(), org_company_id));

CREATE POLICY "Members can delete event claap match cache"
  ON public.event_claap_match_cache FOR DELETE
  USING (public.is_company_member(auth.uid(), org_company_id));

CREATE TRIGGER update_event_claap_match_cache_updated_at
  BEFORE UPDATE ON public.event_claap_match_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
