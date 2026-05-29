
-- ===== Claap Intelligent Mapping System =====

-- 1) Canonical recordings table
CREATE TABLE IF NOT EXISTS public.claap_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  organizer_email TEXT,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcript_available BOOLEAN NOT NULL DEFAULT false,
  source_payload JSONB,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','scored','linked','review','ignored')),
  last_scored_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_company_id, external_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claap_recordings TO authenticated;
GRANT ALL ON public.claap_recordings TO service_role;

ALTER TABLE public.claap_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view recordings in their org"
  ON public.claap_recordings FOR SELECT TO authenticated
  USING (org_company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "Members manage recordings in their org"
  ON public.claap_recordings FOR ALL TO authenticated
  USING (org_company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()))
  WITH CHECK (org_company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE INDEX idx_claap_recordings_org_status ON public.claap_recordings(org_company_id, status);
CREATE INDEX idx_claap_recordings_started_at ON public.claap_recordings(started_at DESC);

-- 2) Candidate matches
CREATE TABLE IF NOT EXISTS public.claap_recording_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES public.claap_recordings(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('meeting','contact','company','deal')),
  entity_id UUID NOT NULL,
  score NUMERIC(4,3) NOT NULL,
  rank INT NOT NULL DEFAULT 0,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_type TEXT NOT NULL CHECK (run_type IN ('post_call','end_of_day')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recording_id, entity_type, entity_id, run_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claap_recording_candidates TO authenticated;
GRANT ALL ON public.claap_recording_candidates TO service_role;

ALTER TABLE public.claap_recording_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view candidates in their org"
  ON public.claap_recording_candidates FOR SELECT TO authenticated
  USING (recording_id IN (
    SELECT id FROM public.claap_recordings
    WHERE org_company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  ));

CREATE POLICY "Service role manages candidates"
  ON public.claap_recording_candidates FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_claap_cand_recording ON public.claap_recording_candidates(recording_id, entity_type, rank);
CREATE INDEX idx_claap_cand_entity ON public.claap_recording_candidates(entity_type, entity_id);

-- 3) Confirmed links
CREATE TABLE IF NOT EXISTS public.claap_recording_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES public.claap_recordings(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('meeting','contact','company','deal')),
  entity_id UUID NOT NULL,
  link_role TEXT NOT NULL CHECK (link_role IN
    ('primary_meeting','attendee_contact','primary_company','primary_deal','secondary_deal')),
  confidence NUMERIC(4,3),
  source TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto','manual','eod')),
  candidate_id UUID REFERENCES public.claap_recording_candidates(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recording_id, link_role, entity_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claap_recording_links TO authenticated;
GRANT ALL ON public.claap_recording_links TO service_role;

ALTER TABLE public.claap_recording_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view links in their org"
  ON public.claap_recording_links FOR SELECT TO authenticated
  USING (recording_id IN (
    SELECT id FROM public.claap_recordings
    WHERE org_company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  ));

CREATE POLICY "Members manage links in their org"
  ON public.claap_recording_links FOR ALL TO authenticated
  USING (recording_id IN (
    SELECT id FROM public.claap_recordings
    WHERE org_company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  ))
  WITH CHECK (recording_id IN (
    SELECT id FROM public.claap_recordings
    WHERE org_company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  ));

CREATE INDEX idx_claap_links_recording ON public.claap_recording_links(recording_id);
CREATE INDEX idx_claap_links_entity ON public.claap_recording_links(entity_type, entity_id);

-- 4) Review log
CREATE TABLE IF NOT EXISTS public.claap_mapping_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID NOT NULL REFERENCES public.claap_recordings(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES public.claap_recording_candidates(id) ON DELETE SET NULL,
  reviewer_id UUID,
  resolution TEXT NOT NULL CHECK (resolution IN ('accepted','rejected','overridden')),
  override_reason TEXT,
  feedback JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claap_mapping_reviews TO authenticated;
GRANT ALL ON public.claap_mapping_reviews TO service_role;

ALTER TABLE public.claap_mapping_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view reviews in their org"
  ON public.claap_mapping_reviews FOR SELECT TO authenticated
  USING (recording_id IN (
    SELECT id FROM public.claap_recordings
    WHERE org_company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  ));

CREATE POLICY "Members insert reviews in their org"
  ON public.claap_mapping_reviews FOR INSERT TO authenticated
  WITH CHECK (recording_id IN (
    SELECT id FROM public.claap_recordings
    WHERE org_company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  ));

CREATE INDEX idx_claap_reviews_recording ON public.claap_mapping_reviews(recording_id);

-- updated_at trigger for recordings
CREATE TRIGGER trg_claap_recordings_updated_at
BEFORE UPDATE ON public.claap_recordings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) RPCs for accept / reject / mark unrelated
CREATE OR REPLACE FUNCTION public.claap_accept_suggestion(
  p_candidate_id UUID,
  p_link_role TEXT
) RETURNS public.claap_recording_links
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cand public.claap_recording_candidates;
  v_rec public.claap_recordings;
  v_link public.claap_recording_links;
BEGIN
  SELECT * INTO v_cand FROM public.claap_recording_candidates WHERE id = p_candidate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate not found'; END IF;

  SELECT * INTO v_rec FROM public.claap_recordings WHERE id = v_cand.recording_id;
  IF v_rec.org_company_id IS NULL
     OR v_rec.org_company_id NOT IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.claap_recording_links
    (recording_id, entity_type, entity_id, link_role, confidence, source, candidate_id, created_by)
  VALUES
    (v_cand.recording_id, v_cand.entity_type, v_cand.entity_id, p_link_role, v_cand.score, 'manual', v_cand.id, auth.uid())
  ON CONFLICT (recording_id, link_role, entity_id)
  DO UPDATE SET confidence = EXCLUDED.confidence, source = 'manual', candidate_id = EXCLUDED.candidate_id
  RETURNING * INTO v_link;

  INSERT INTO public.claap_mapping_reviews
    (recording_id, candidate_id, reviewer_id, resolution)
  VALUES (v_cand.recording_id, v_cand.id, auth.uid(), 'accepted');

  RETURN v_link;
END $$;

GRANT EXECUTE ON FUNCTION public.claap_accept_suggestion(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.claap_reject_suggestion(
  p_candidate_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cand public.claap_recording_candidates;
  v_rec public.claap_recordings;
BEGIN
  SELECT * INTO v_cand FROM public.claap_recording_candidates WHERE id = p_candidate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate not found'; END IF;

  SELECT * INTO v_rec FROM public.claap_recordings WHERE id = v_cand.recording_id;
  IF v_rec.org_company_id NOT IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.claap_recording_candidates SET rank = -1 WHERE id = p_candidate_id;

  INSERT INTO public.claap_mapping_reviews
    (recording_id, candidate_id, reviewer_id, resolution, override_reason)
  VALUES (v_cand.recording_id, v_cand.id, auth.uid(), 'rejected', p_reason);
END $$;

GRANT EXECUTE ON FUNCTION public.claap_reject_suggestion(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.claap_mark_unrelated(
  p_recording_id UUID,
  p_entity_type TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rec public.claap_recordings;
BEGIN
  SELECT * INTO v_rec FROM public.claap_recordings WHERE id = p_recording_id;
  IF v_rec.org_company_id NOT IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.claap_recording_candidates
    SET rank = -1
    WHERE recording_id = p_recording_id AND entity_type = p_entity_type;

  INSERT INTO public.claap_mapping_reviews
    (recording_id, reviewer_id, resolution, override_reason, feedback)
  VALUES (p_recording_id, auth.uid(), 'rejected', 'marked_unrelated', jsonb_build_object('entity_type', p_entity_type));
END $$;

GRANT EXECUTE ON FUNCTION public.claap_mark_unrelated(UUID, TEXT) TO authenticated;
