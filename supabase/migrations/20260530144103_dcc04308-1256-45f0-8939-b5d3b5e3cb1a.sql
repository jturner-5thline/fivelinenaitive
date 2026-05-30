-- Enum for the resolution status
DO $$ BEGIN
  CREATE TYPE public.meeting_claap_resolution_status AS ENUM (
    'auto_linked','suggested','no_match','manual_linked','manually_changed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table caching the per-meeting Claap match decision
CREATE TABLE IF NOT EXISTS public.meeting_claap_resolution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id UUID NOT NULL,
  event_id TEXT NOT NULL,
  resolution_status public.meeting_claap_resolution_status NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  top_candidate_recording_id UUID,
  top_candidate_external_id TEXT,
  top_candidate_score NUMERIC,
  top_candidate_title TEXT,
  top_candidate_url TEXT,
  run_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meeting_claap_resolution_unique UNIQUE (org_company_id, event_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_claap_resolution TO authenticated;
GRANT ALL ON public.meeting_claap_resolution TO service_role;

ALTER TABLE public.meeting_claap_resolution ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view resolutions in their org" ON public.meeting_claap_resolution;
CREATE POLICY "Members view resolutions in their org"
  ON public.meeting_claap_resolution FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), org_company_id));

DROP POLICY IF EXISTS "Members manage resolutions in their org" ON public.meeting_claap_resolution;
CREATE POLICY "Members manage resolutions in their org"
  ON public.meeting_claap_resolution FOR ALL TO authenticated
  USING (public.is_company_member(auth.uid(), org_company_id))
  WITH CHECK (public.is_company_member(auth.uid(), org_company_id));

CREATE INDEX IF NOT EXISTS idx_mcr_event ON public.meeting_claap_resolution(org_company_id, event_id);
CREATE INDEX IF NOT EXISTS idx_mcr_status ON public.meeting_claap_resolution(resolution_status);
CREATE INDEX IF NOT EXISTS idx_mcr_recording ON public.meeting_claap_resolution(top_candidate_recording_id);

DROP TRIGGER IF EXISTS trg_mcr_updated_at ON public.meeting_claap_resolution;
CREATE TRIGGER trg_mcr_updated_at
  BEFORE UPDATE ON public.meeting_claap_resolution
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: when a manual link is created, persist as manually_changed resolution.
CREATE OR REPLACE FUNCTION public.sync_meeting_claap_resolution_from_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical_id UUID;
BEGIN
  SELECT id INTO v_canonical_id
  FROM public.claap_recordings
  WHERE external_id = NEW.recording_id
  LIMIT 1;

  INSERT INTO public.meeting_claap_resolution AS m (
    org_company_id, event_id, resolution_status, resolved_at,
    top_candidate_recording_id, top_candidate_external_id,
    top_candidate_title, top_candidate_url
  ) VALUES (
    NEW.org_company_id, NEW.event_id, 'manually_changed', now(),
    v_canonical_id, NEW.recording_id, NEW.recording_title, NEW.recording_url
  )
  ON CONFLICT (org_company_id, event_id) DO UPDATE
  SET resolution_status = 'manually_changed',
      resolved_at = now(),
      top_candidate_recording_id = EXCLUDED.top_candidate_recording_id,
      top_candidate_external_id = EXCLUDED.top_candidate_external_id,
      top_candidate_title = EXCLUDED.top_candidate_title,
      top_candidate_url = EXCLUDED.top_candidate_url;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ecr_sync_resolution ON public.event_claap_recordings;
CREATE TRIGGER trg_ecr_sync_resolution
  AFTER INSERT OR UPDATE ON public.event_claap_recordings
  FOR EACH ROW EXECUTE FUNCTION public.sync_meeting_claap_resolution_from_link();

-- Backfill: every existing event_claap_recordings row becomes manual_linked.
INSERT INTO public.meeting_claap_resolution (
  org_company_id, event_id, resolution_status, resolved_at,
  top_candidate_recording_id, top_candidate_external_id,
  top_candidate_title, top_candidate_url
)
SELECT DISTINCT ON (ecr.org_company_id, ecr.event_id)
  ecr.org_company_id,
  ecr.event_id,
  'manual_linked'::public.meeting_claap_resolution_status,
  COALESCE(ecr.linked_at, now()),
  cr.id,
  ecr.recording_id,
  ecr.recording_title,
  ecr.recording_url
FROM public.event_claap_recordings ecr
LEFT JOIN public.claap_recordings cr ON cr.external_id = ecr.recording_id
ORDER BY ecr.org_company_id, ecr.event_id, ecr.linked_at DESC NULLS LAST
ON CONFLICT (org_company_id, event_id) DO NOTHING;

-- Enable realtime so the UI gets push updates when a resolution changes.
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_claap_resolution;
ALTER TABLE public.meeting_claap_resolution REPLICA IDENTITY FULL;