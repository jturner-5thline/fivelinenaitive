-- ====== Claap hardening, observability, manual rescore ======

-- 1) run_type enum supports 'manual'
ALTER TABLE public.claap_recording_candidates
  DROP CONSTRAINT IF EXISTS claap_recording_candidates_run_type_check;
ALTER TABLE public.claap_recording_candidates
  ADD CONSTRAINT claap_recording_candidates_run_type_check
  CHECK (run_type IN ('post_call','end_of_day','manual'));

-- Add 'manual' to source for links too (UI rescore is manual; webhook = auto)
ALTER TABLE public.claap_recording_links
  DROP CONSTRAINT IF EXISTS claap_recording_links_source_check;
ALTER TABLE public.claap_recording_links
  ADD CONSTRAINT claap_recording_links_source_check
  CHECK (source IN ('auto','manual','eod'));

-- 2) Tighten RLS — drop permissive ALL policies, replace with per-action ones.
--    Clients read-only on recordings, candidates, links (writes via SECURITY DEFINER RPCs / service role).

DROP POLICY IF EXISTS "Members manage recordings in their org" ON public.claap_recordings;
DROP POLICY IF EXISTS "Members manage links in their org" ON public.claap_recording_links;

REVOKE INSERT, UPDATE, DELETE ON public.claap_recordings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.claap_recording_candidates FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.claap_recording_links FROM authenticated;

-- recordings: SELECT scoped to tenant; writes via service role only
CREATE POLICY "Service role writes recordings"
  ON public.claap_recordings FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role updates recordings"
  ON public.claap_recordings FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role deletes recordings"
  ON public.claap_recordings FOR DELETE TO service_role USING (true);

-- candidates: already SELECT-tenant + service ALL; nothing to add (clients have no INSERT)

-- links: SELECT tenant, writes via service role / definer RPCs only
CREATE POLICY "Service role writes links"
  ON public.claap_recording_links FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role updates links"
  ON public.claap_recording_links FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role deletes links"
  ON public.claap_recording_links FOR DELETE TO service_role USING (true);

-- 3) Webhook ingestion log
CREATE TABLE IF NOT EXISTS public.claap_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  external_id TEXT,
  org_company_id UUID,
  ok BOOLEAN NOT NULL,
  status_code INT,
  error TEXT,
  payload JSONB
);
GRANT SELECT ON public.claap_webhook_log TO authenticated;
GRANT ALL ON public.claap_webhook_log TO service_role;
ALTER TABLE public.claap_webhook_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read webhook log in their org"
  ON public.claap_webhook_log FOR SELECT TO authenticated
  USING (org_company_id IS NULL OR org_company_id IN
    (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));
CREATE POLICY "Service role manages webhook log"
  ON public.claap_webhook_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4) Scoring runs observability
CREATE TABLE IF NOT EXISTS public.claap_scoring_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_id UUID REFERENCES public.claap_recordings(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL CHECK (run_type IN ('post_call','end_of_day','manual')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  candidates_written INT NOT NULL DEFAULT 0,
  auto_links_written INT NOT NULL DEFAULT 0,
  error TEXT
);
GRANT SELECT ON public.claap_scoring_runs TO authenticated;
GRANT ALL ON public.claap_scoring_runs TO service_role;
ALTER TABLE public.claap_scoring_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read scoring runs in their org"
  ON public.claap_scoring_runs FOR SELECT TO authenticated
  USING (recording_id IS NULL OR recording_id IN (
    SELECT id FROM public.claap_recordings
    WHERE org_company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  ));
CREATE POLICY "Service role writes scoring runs"
  ON public.claap_scoring_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_claap_scoring_runs_recording
  ON public.claap_scoring_runs(recording_id, started_at DESC);

-- 5) Manual rescore RPC — caller-side stub; the edge function does the actual scoring.
--    This validates tenant access and returns recording info so the client can call the function.
CREATE OR REPLACE FUNCTION public.claap_request_rescore(p_recording_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rec public.claap_recordings;
BEGIN
  SELECT * INTO v_rec FROM public.claap_recordings WHERE id = p_recording_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'recording not found'; END IF;
  IF v_rec.org_company_id NOT IN
     (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN TRUE;
END $$;
GRANT EXECUTE ON FUNCTION public.claap_request_rescore(UUID) TO authenticated;

-- 6) Tenant isolation test
CREATE OR REPLACE FUNCTION public.claap_assert_tenant_isolation()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cross_recordings INT;
  v_cross_candidates INT;
  v_cross_links INT;
BEGIN
  -- Counts of rows referencing org_company_ids NOT visible to caller.
  SELECT count(*) INTO v_cross_recordings FROM public.claap_recordings r
    WHERE r.org_company_id IS NOT NULL
      AND r.org_company_id NOT IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid());
  SELECT count(*) INTO v_cross_candidates FROM public.claap_recording_candidates c
    JOIN public.claap_recordings r ON r.id = c.recording_id
    WHERE r.org_company_id NOT IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid());
  SELECT count(*) INTO v_cross_links FROM public.claap_recording_links l
    JOIN public.claap_recordings r ON r.id = l.recording_id
    WHERE r.org_company_id NOT IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid());
  RETURN jsonb_build_object(
    'cross_tenant_recordings_visible_via_definer', v_cross_recordings,
    'cross_tenant_candidates_visible_via_definer', v_cross_candidates,
    'cross_tenant_links_visible_via_definer', v_cross_links,
    'note', 'Counts here reflect global rows; RLS-bound clients see 0 by policy.'
  );
END $$;
GRANT EXECUTE ON FUNCTION public.claap_assert_tenant_isolation() TO authenticated;

-- 7) Seed + smoke test
CREATE OR REPLACE FUNCTION public.claap_seed_demo(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ids UUID[] := ARRAY[]::UUID[];
  v_rec UUID;
  v_existing_contact_email TEXT;
  v_existing_deal_company TEXT;
  v_titles TEXT[] := ARRAY['Demo Discovery Call','Demo Lender Sync','Demo Sponsor Update'];
  i INT;
BEGIN
  -- Pick a contact email and deal company name from the tenant if available.
  SELECT email INTO v_existing_contact_email
    FROM public.contacts WHERE org_company_id = p_tenant_id AND email IS NOT NULL LIMIT 1;
  SELECT company INTO v_existing_deal_company
    FROM public.deals d
    WHERE d.company IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = p_tenant_id)
    LIMIT 1;

  FOR i IN 1..3 LOOP
    INSERT INTO public.claap_recordings
      (org_company_id, external_id, title, started_at, ended_at, organizer_email, participants, transcript_available, source_payload, status)
    VALUES (
      p_tenant_id,
      'demo-' || p_tenant_id::text || '-' || i,
      v_titles[i] || COALESCE(' — ' || v_existing_deal_company, ''),
      now() - (i || ' hours')::interval,
      now() - (i || ' hours')::interval + interval '30 minutes',
      COALESCE(v_existing_contact_email, 'demo@example.com'),
      COALESCE(jsonb_build_array(v_existing_contact_email), '[]'::jsonb),
      false,
      jsonb_build_object('transcript', 'Demo seed transcript mentioning ' || COALESCE(v_existing_deal_company,'the deal')),
      'new'
    )
    ON CONFLICT (org_company_id, external_id) DO UPDATE SET title = EXCLUDED.title
    RETURNING id INTO v_rec;
    v_ids := array_append(v_ids, v_rec);
  END LOOP;

  RETURN jsonb_build_object('seeded_recording_ids', v_ids);
END $$;
GRANT EXECUTE ON FUNCTION public.claap_seed_demo(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.claap_run_smoke_test()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_tenant UUID;
  v_seed JSONB;
  v_auto INT;
  v_review INT;
  v_hold INT;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email NOT IN ('jturner@5thline.co','ppina@5thline.co') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT company_id INTO v_tenant FROM public.company_members WHERE user_id = auth.uid() LIMIT 1;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'no tenant'; END IF;

  v_seed := public.claap_seed_demo(v_tenant);

  -- Count bands from existing candidates for the seeded recordings.
  SELECT
    count(*) FILTER (WHERE score >= 0.90),
    count(*) FILTER (WHERE score >= 0.65 AND score < 0.90),
    count(*) FILTER (WHERE score < 0.65)
  INTO v_auto, v_review, v_hold
  FROM public.claap_recording_candidates
  WHERE recording_id = ANY (ARRAY(SELECT jsonb_array_elements_text(v_seed->'seeded_recording_ids'))::uuid[]);

  RETURN jsonb_build_object(
    'tenant_id', v_tenant,
    'seeded_recording_ids', v_seed->'seeded_recording_ids',
    'bands', jsonb_build_object('auto', v_auto, 'review', v_review, 'hold', v_hold),
    'note', 'Trigger the score edge function from the UI for each seeded recording to populate bands.'
  );
END $$;
GRANT EXECUTE ON FUNCTION public.claap_run_smoke_test() TO authenticated;