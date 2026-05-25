
-- Triage columns
ALTER TABLE public.lender_sync_requests
  ADD COLUMN IF NOT EXISTS confidence text,
  ADD COLUMN IF NOT EXISTS suggested_action text,
  ADD COLUMN IF NOT EXISTS match_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS match_reason text,
  ADD COLUMN IF NOT EXISTS conflict_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contact_change_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_reviewer_id uuid;

-- Relax status check
ALTER TABLE public.lender_sync_requests DROP CONSTRAINT IF EXISTS lender_sync_requests_status_check;
ALTER TABLE public.lender_sync_requests
  ADD CONSTRAINT lender_sync_requests_status_check CHECK (status = ANY (ARRAY[
    'pending','approved','rejected','merged','auto_approved',
    'pending_new','pending_match_review','pending_conflict_review',
    'approved_add','approved_update','approved_merge','completed'
  ]));

ALTER TABLE public.lender_sync_requests
  ADD CONSTRAINT lender_sync_requests_confidence_check CHECK (
    confidence IS NULL OR confidence = ANY (ARRAY['exact_duplicate','likely_duplicate','possible_match','needs_review','none'])
  );

ALTER TABLE public.lender_sync_requests
  ADD CONSTRAINT lender_sync_requests_suggested_action_check CHECK (
    suggested_action IS NULL OR suggested_action = ANY (ARRAY['add','update','merge','review'])
  );

CREATE INDEX IF NOT EXISTS idx_lsr_status_confidence ON public.lender_sync_requests(status, confidence);
CREATE INDEX IF NOT EXISTS idx_lsr_suggested_action ON public.lender_sync_requests(suggested_action);
CREATE INDEX IF NOT EXISTS idx_lsr_assigned_reviewer ON public.lender_sync_requests(assigned_reviewer_id);

-- Audit table for per-field decisions
CREATE TABLE IF NOT EXISTS public.lender_sync_request_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.lender_sync_requests(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('lender','contact')),
  existing_value jsonb,
  incoming_value jsonb,
  action text NOT NULL CHECK (action IN ('keep','use_incoming','fill_empty','append','mark_conflict')),
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
CREATE INDEX IF NOT EXISTS idx_lsrd_request ON public.lender_sync_request_decisions(request_id);

ALTER TABLE public.lender_sync_request_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view lender sync decisions"
  ON public.lender_sync_request_decisions FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert lender sync decisions"
  ON public.lender_sync_request_decisions FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Per-company settings
CREATE TABLE IF NOT EXISTS public.lender_sync_settings (
  company_id uuid PRIMARY KEY,
  auto_approve_deterministic boolean NOT NULL DEFAULT false,
  likely_match_threshold numeric NOT NULL DEFAULT 0.82,
  possible_match_threshold numeric NOT NULL DEFAULT 0.65,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lender_sync_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view lender sync settings"
  ON public.lender_sync_settings FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert lender sync settings"
  ON public.lender_sync_settings FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update lender sync settings"
  ON public.lender_sync_settings FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE TRIGGER trg_lender_sync_settings_updated
  BEFORE UPDATE ON public.lender_sync_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
