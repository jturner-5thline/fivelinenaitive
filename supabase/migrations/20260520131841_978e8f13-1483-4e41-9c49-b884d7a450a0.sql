-- ─────────────────────────────────────────────────────────────────────────
-- Lender recommendation engine: persistence + feedback layer
-- ─────────────────────────────────────────────────────────────────────────

-- 1. deal_fit_profiles ─ canonical AI-extracted attributes per deal
CREATE TABLE IF NOT EXISTS public.deal_fit_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL UNIQUE,
  summary text,
  positive_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  negative_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  nuanced_preferences jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding vector(1536),
  source_hash text,
  extracted_at timestamptz,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_fit_profiles_deal ON public.deal_fit_profiles(deal_id);

ALTER TABLE public.deal_fit_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated who can read the parent deal can read its fit profile.
CREATE POLICY "View deal fit profile via deal access"
ON public.deal_fit_profiles FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_fit_profiles.deal_id));

CREATE POLICY "Internal users manage deal fit profiles"
ON public.deal_fit_profiles FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid()
    AND (u.email LIKE '%@5thline.co' OR u.email LIKE '%@naitive.co'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid()
    AND (u.email LIKE '%@5thline.co' OR u.email LIKE '%@naitive.co'))
);

CREATE TRIGGER update_deal_fit_profiles_updated_at
BEFORE UPDATE ON public.deal_fit_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2. lender_recommendation_runs ─ one row per recommend-lenders call
CREATE TABLE IF NOT EXISTS public.lender_recommendation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL,
  triggered_by uuid,
  qa_mode boolean NOT NULL DEFAULT false,
  criteria_override jsonb,
  evaluated_count integer NOT NULL DEFAULT 0,
  scored_count integer NOT NULL DEFAULT 0,
  hard_filtered_count integer NOT NULL DEFAULT 0,
  model_used text,
  weights jsonb,
  meta jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lender_recommendation_runs_deal ON public.lender_recommendation_runs(deal_id, generated_at DESC);

ALTER TABLE public.lender_recommendation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View runs via deal access"
ON public.lender_recommendation_runs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = lender_recommendation_runs.deal_id));

CREATE POLICY "Authed users can insert runs they trigger"
ON public.lender_recommendation_runs FOR INSERT TO authenticated
WITH CHECK (triggered_by = auth.uid() OR triggered_by IS NULL);


-- 3. lender_recommendation_run_items ─ per-lender snapshot for each run
CREATE TABLE IF NOT EXISTS public.lender_recommendation_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.lender_recommendation_runs(id) ON DELETE CASCADE,
  lender_id uuid,
  lender_name text NOT NULL,
  hard_filtered boolean NOT NULL DEFAULT false,
  failed_check text,
  failed_reason text,
  match_score integer,
  confidence integer,
  structured_score integer,
  unstructured_score integer,
  penalty_total integer,
  boost_total integer,
  ai_adjustment integer,
  dominant_driver text,
  rationale text,
  components jsonb,
  rank_position integer
);
CREATE INDEX IF NOT EXISTS idx_lender_rec_run_items_run ON public.lender_recommendation_run_items(run_id);
CREATE INDEX IF NOT EXISTS idx_lender_rec_run_items_lender ON public.lender_recommendation_run_items(lender_name);

ALTER TABLE public.lender_recommendation_run_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View run items via run access"
ON public.lender_recommendation_run_items FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.lender_recommendation_runs r
  JOIN public.deals d ON d.id = r.deal_id
  WHERE r.id = lender_recommendation_run_items.run_id
));

CREATE POLICY "Authed users can insert run items"
ON public.lender_recommendation_run_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.lender_recommendation_runs r WHERE r.id = lender_recommendation_run_items.run_id));


-- 4. lender_recommendation_outcomes ─ explicit team feedback per (deal, lender)
DO $$ BEGIN
  CREATE TYPE public.lender_recommendation_outcome_status AS ENUM (
    'recommended', 'dismissed', 'contacted', 'engaged', 'declined',
    'terms_issued', 'diligence', 'closed_won', 'closed_lost'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.lender_recommendation_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL,
  lender_id uuid,
  lender_name text NOT NULL,
  run_id uuid REFERENCES public.lender_recommendation_runs(id) ON DELETE SET NULL,
  status public.lender_recommendation_outcome_status NOT NULL,
  decline_reason text,
  fit_quality smallint, -- 1..5 team rating
  notes text,
  reported_by uuid NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_fit_quality CHECK (fit_quality IS NULL OR (fit_quality BETWEEN 1 AND 5))
);
CREATE INDEX IF NOT EXISTS idx_lender_rec_outcomes_deal ON public.lender_recommendation_outcomes(deal_id);
CREATE INDEX IF NOT EXISTS idx_lender_rec_outcomes_lender ON public.lender_recommendation_outcomes(lender_name);
CREATE INDEX IF NOT EXISTS idx_lender_rec_outcomes_lender_id ON public.lender_recommendation_outcomes(lender_id);

ALTER TABLE public.lender_recommendation_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View outcomes via deal access"
ON public.lender_recommendation_outcomes FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = lender_recommendation_outcomes.deal_id));

CREATE POLICY "Authed users record outcomes"
ON public.lender_recommendation_outcomes FOR INSERT TO authenticated
WITH CHECK (reported_by = auth.uid());

CREATE POLICY "Authed users update outcomes they reported"
ON public.lender_recommendation_outcomes FOR UPDATE TO authenticated
USING (reported_by = auth.uid());


-- 5. lender_match_rules ─ admin "do not match" rules
CREATE TABLE IF NOT EXISTS public.lender_match_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type text NOT NULL CHECK (rule_type IN ('do_not_match', 'force_match', 'penalize', 'boost')),
  lender_id uuid,
  lender_name text,
  -- Optional scoping: rule only applies when the deal matches these criteria
  applies_when jsonb, -- e.g. { "dealType": ["ABL"], "industry": "consumer", "minDealValue": 1000000 }
  reason text NOT NULL,
  delta integer, -- for penalize/boost (-25..+25)
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lender_match_rules_lender ON public.lender_match_rules(lender_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_lender_match_rules_lender_name ON public.lender_match_rules(lower(lender_name)) WHERE active;

ALTER TABLE public.lender_match_rules ENABLE ROW LEVEL SECURITY;

-- Match rules apply globally — readable by any authed user (so the engine
-- can fetch them), manageable only by 5th Line internal.
CREATE POLICY "All authed users can read match rules"
ON public.lender_match_rules FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Internal users manage match rules"
ON public.lender_match_rules FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid()
  AND (u.email LIKE '%@5thline.co' OR u.email LIKE '%@naitive.co')))
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = auth.uid()
    AND (u.email LIKE '%@5thline.co' OR u.email LIKE '%@naitive.co'))
);

CREATE TRIGGER update_lender_match_rules_updated_at
BEFORE UPDATE ON public.lender_match_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 6. Trigger: invalidate cached lender_fit_attributes when notes change
CREATE OR REPLACE FUNCTION public.invalidate_lender_fit_on_notes_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.lender_fit_attributes
    SET source_hash = NULL
    WHERE master_lender_id = OLD.master_lender_id
       OR (master_lender_id IS NULL AND lower(lender_name) = lower(OLD.lender_name));
    RETURN OLD;
  ELSE
    UPDATE public.lender_fit_attributes
    SET source_hash = NULL
    WHERE master_lender_id = NEW.master_lender_id
       OR (master_lender_id IS NULL AND lower(lender_name) = lower(NEW.lender_name));
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_lender_fit_on_notes ON public.lender_notes;
CREATE TRIGGER trg_invalidate_lender_fit_on_notes
AFTER INSERT OR UPDATE OR DELETE ON public.lender_notes
FOR EACH ROW EXECUTE FUNCTION public.invalidate_lender_fit_on_notes_change();


-- 7. Trigger: invalidate cached deal_fit_profiles when deal write-up or notes change
CREATE OR REPLACE FUNCTION public.invalidate_deal_fit_on_writeup_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.deal_fit_profiles
  SET source_hash = NULL
  WHERE deal_id = COALESCE(NEW.deal_id, OLD.deal_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_invalidate_deal_fit_on_writeup ON public.deal_writeups;
CREATE TRIGGER trg_invalidate_deal_fit_on_writeup
AFTER INSERT OR UPDATE OR DELETE ON public.deal_writeups
FOR EACH ROW EXECUTE FUNCTION public.invalidate_deal_fit_on_writeup_change();

DROP TRIGGER IF EXISTS trg_invalidate_deal_fit_on_notes ON public.deal_space_notes;
CREATE TRIGGER trg_invalidate_deal_fit_on_notes
AFTER INSERT OR UPDATE OR DELETE ON public.deal_space_notes
FOR EACH ROW EXECUTE FUNCTION public.invalidate_deal_fit_on_writeup_change();
