
CREATE TABLE IF NOT EXISTS public.event_claap_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL,
  event_id text NOT NULL,
  recording_id text NOT NULL,
  recording_title text,
  recording_url text,
  thumbnail_url text,
  duration_seconds integer,
  recorder_name text,
  recorder_email text,
  recorded_at timestamptz,
  deal_ids uuid[] NOT NULL DEFAULT '{}',
  company_ids uuid[] NOT NULL DEFAULT '{}',
  contact_ids uuid[] NOT NULL DEFAULT '{}',
  notes text,
  linked_by uuid,
  linked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_company_id, event_id, recording_id)
);

CREATE INDEX IF NOT EXISTS idx_event_claap_event ON public.event_claap_recordings (org_company_id, event_id);
CREATE INDEX IF NOT EXISTS idx_event_claap_recording ON public.event_claap_recordings (org_company_id, recording_id);
CREATE INDEX IF NOT EXISTS idx_event_claap_deal_ids ON public.event_claap_recordings USING GIN (deal_ids);
CREATE INDEX IF NOT EXISTS idx_event_claap_company_ids ON public.event_claap_recordings USING GIN (company_ids);
CREATE INDEX IF NOT EXISTS idx_event_claap_contact_ids ON public.event_claap_recordings USING GIN (contact_ids);

ALTER TABLE public.event_claap_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view event claap links"
  ON public.event_claap_recordings FOR SELECT
  USING (public.is_company_member(auth.uid(), org_company_id));

CREATE POLICY "Members can insert event claap links"
  ON public.event_claap_recordings FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), org_company_id));

CREATE POLICY "Members can update event claap links"
  ON public.event_claap_recordings FOR UPDATE
  USING (public.is_company_member(auth.uid(), org_company_id));

CREATE POLICY "Members can delete event claap links"
  ON public.event_claap_recordings FOR DELETE
  USING (public.is_company_member(auth.uid(), org_company_id));

CREATE TRIGGER trg_event_claap_recordings_updated_at
  BEFORE UPDATE ON public.event_claap_recordings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
