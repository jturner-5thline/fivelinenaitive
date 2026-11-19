CREATE TABLE public.deal_lender_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  deal_lender_id uuid NOT NULL,
  deal_id uuid,
  master_lender_id uuid,
  from_stage text,
  to_stage text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,
  source text NOT NULL,
  seed_key text UNIQUE
);
COMMENT ON TABLE public.deal_lender_stage_events IS 'Append-only deal_lenders stage history. source: trigger | seed_from_timestamps | seed_from_activity_logs';
CREATE INDEX deal_lender_stage_events_lender_idx ON public.deal_lender_stage_events(master_lender_id, changed_at DESC);
CREATE INDEX deal_lender_stage_events_deal_idx ON public.deal_lender_stage_events(deal_id, changed_at DESC);
CREATE INDEX deal_lender_stage_events_dl_idx ON public.deal_lender_stage_events(deal_lender_id, changed_at);

GRANT SELECT ON public.deal_lender_stage_events TO authenticated;
GRANT ALL ON public.deal_lender_stage_events TO service_role;
ALTER TABLE public.deal_lender_stage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Company members can view lender stage events" ON public.deal_lender_stage_events FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.record_deal_lender_stage_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.deal_lender_stage_events(company_id, deal_lender_id, deal_id, master_lender_id, from_stage, to_stage, changed_at, changed_by, source)
  SELECT d.company_id, NEW.id, NEW.deal_id, NEW.master_lender_id, OLD.stage, NEW.stage, now(), auth.uid(), 'trigger'
  FROM (SELECT 1) x LEFT JOIN public.deals d ON d.id = NEW.deal_id;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.record_deal_lender_stage_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_record_deal_lender_stage_event AFTER UPDATE OF stage ON public.deal_lenders
  FOR EACH ROW WHEN (OLD.stage IS DISTINCT FROM NEW.stage)
  EXECUTE FUNCTION public.record_deal_lender_stage_event();

-- One-time seed (insert-only into the new table)
INSERT INTO public.deal_lender_stage_events(company_id, deal_lender_id, deal_id, master_lender_id, from_stage, to_stage, changed_at, source, seed_key)
SELECT d.company_id, dl.id, dl.deal_id, dl.master_lender_id, NULL, t.bucket, t.ts, 'seed_from_timestamps', 'ts|' || dl.id || '|' || t.bucket
FROM public.deal_lenders dl
LEFT JOIN public.deals d ON d.id = dl.deal_id
CROSS JOIN LATERAL (VALUES ('on_deck', dl.on_deck_at), ('submitted', dl.submitted_at), ('approved', dl.approved_at),
  ('passed', dl.passed_at), ('declined', dl.declined_at), ('on_hold', dl.on_hold_at), ('excluded', dl.excluded_at)) AS t(bucket, ts)
WHERE t.ts IS NOT NULL
ON CONFLICT (seed_key) DO NOTHING;

INSERT INTO public.deal_lender_stage_events(company_id, deal_lender_id, deal_id, master_lender_id, from_stage, to_stage, changed_at, changed_by, source, seed_key)
SELECT d.company_id, dl.id, dl.deal_id, dl.master_lender_id, a.metadata->>'from', a.metadata->>'to', a.created_at, a.user_id, 'seed_from_activity_logs', 'al|' || a.id
FROM public.activity_logs a
JOIN public.deal_lenders dl ON dl.id::text = a.metadata->>'lender_id'
LEFT JOIN public.deals d ON d.id = dl.deal_id
WHERE a.activity_type = 'lender_stage_change'
ON CONFLICT (seed_key) DO NOTHING;

-- Performance scores
CREATE TABLE public.lender_performance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  lender_id uuid NOT NULL UNIQUE REFERENCES public.master_lenders(id) ON DELETE CASCADE,
  computed_at timestamptz NOT NULL DEFAULT now(),
  window_days int,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  overall_label text,
  version text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.lender_performance_scores.dimensions IS '{ "<dimension>": { "score": 0-100 | null, "driver": text } }';
COMMENT ON COLUMN public.lender_performance_scores.overall_label IS 'strong | mixed | weak';

CREATE TABLE public.lender_performance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  lender_id uuid NOT NULL REFERENCES public.master_lenders(id) ON DELETE CASCADE,
  computed_at timestamptz NOT NULL,
  window_days int,
  dimensions jsonb NOT NULL,
  overall_label text,
  version text,
  written_by uuid DEFAULT auth.uid(),
  written_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lender_performance_history_lender_idx ON public.lender_performance_history(lender_id, computed_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lender_performance_scores TO authenticated;
GRANT ALL ON public.lender_performance_scores TO service_role;
GRANT SELECT, INSERT ON public.lender_performance_history TO authenticated;
GRANT ALL ON public.lender_performance_history TO service_role;
ALTER TABLE public.lender_performance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lender_performance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members view lender performance" ON public.lender_performance_scores FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));
CREATE POLICY "Company members insert lender performance" ON public.lender_performance_scores FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));
CREATE POLICY "Company members update lender performance" ON public.lender_performance_scores FOR UPDATE TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));
CREATE POLICY "Admins delete lender performance" ON public.lender_performance_scores FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "Company members view lender performance history" ON public.lender_performance_history FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));
CREATE POLICY "Company members append lender performance history" ON public.lender_performance_history FOR INSERT TO authenticated
  WITH CHECK (written_by = auth.uid() AND company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()));

-- Each row fills its own workspace from the lender (touches only the row being written)
CREATE OR REPLACE FUNCTION public.lender_performance_fill_company()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.company_id := OLD.company_id; NEW.lender_id := OLD.lender_id;
  ELSE
    SELECT ml.company_id INTO NEW.company_id FROM public.master_lenders ml WHERE ml.id = NEW.lender_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.lender_performance_fill_company() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER lender_performance_scores_fill BEFORE INSERT OR UPDATE ON public.lender_performance_scores
  FOR EACH ROW EXECUTE FUNCTION public.lender_performance_fill_company();
CREATE TRIGGER lender_performance_history_fill BEFORE INSERT ON public.lender_performance_history
  FOR EACH ROW EXECUTE FUNCTION public.lender_performance_fill_company();

-- Caller-scoped (invoker) write: upsert score + append history in one transaction
CREATE OR REPLACE FUNCTION public.upsert_lender_performance(_lender_id uuid, _computed_at timestamptz, _window_days int,
  _dimensions jsonb, _overall_label text, _version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE s public.lender_performance_scores; h_id uuid; existed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _overall_label IS NOT NULL AND _overall_label NOT IN ('strong','mixed','weak') THEN RAISE EXCEPTION 'overall_label must be strong, mixed or weak'; END IF;
  IF jsonb_typeof(coalesce(_dimensions,'{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION 'dimensions must be an object'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.master_lenders WHERE id = _lender_id) THEN RAISE EXCEPTION 'Funding source not found or not accessible'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.lender_performance_scores WHERE lender_id = _lender_id) INTO existed;
  INSERT INTO public.lender_performance_scores(lender_id, computed_at, window_days, dimensions, overall_label, version, updated_by, updated_at)
  VALUES (_lender_id, coalesce(_computed_at, now()), _window_days, coalesce(_dimensions,'{}'::jsonb), _overall_label, _version, auth.uid(), now())
  ON CONFLICT (lender_id) DO UPDATE SET computed_at = EXCLUDED.computed_at, window_days = EXCLUDED.window_days,
    dimensions = EXCLUDED.dimensions, overall_label = EXCLUDED.overall_label, version = EXCLUDED.version,
    updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING * INTO s;
  INSERT INTO public.lender_performance_history(lender_id, computed_at, window_days, dimensions, overall_label, version, written_by)
  VALUES (s.lender_id, s.computed_at, s.window_days, s.dimensions, s.overall_label, s.version, auth.uid())
  RETURNING id INTO h_id;
  RETURN jsonb_build_object('score_id', s.id, 'history_id', h_id, 'action', CASE WHEN existed THEN 'updated' ELSE 'created' END);
END $$;
REVOKE EXECUTE ON FUNCTION public.upsert_lender_performance(uuid, timestamptz, int, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_lender_performance(uuid, timestamptz, int, jsonb, text, text) TO authenticated;