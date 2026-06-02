-- Trigram index for fuzzy deal-name lookups (Tier 3)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS deals_company_trgm_idx
  ON public.deals USING gin (company gin_trgm_ops);

-- AI Copilot audit table for name-collision / fuzzy-match events
CREATE TABLE IF NOT EXISTS public.ai_copilot_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid,
  action text NOT NULL,
  resolved_action text,
  proposed jsonb,
  deal_ids uuid[] DEFAULT ARRAY[]::uuid[],
  details jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.ai_copilot_audit TO authenticated;
GRANT ALL ON public.ai_copilot_audit TO service_role;

ALTER TABLE public.ai_copilot_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_copilot_audit insert own"
  ON public.ai_copilot_audit FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ai_copilot_audit select same workspace"
  ON public.ai_copilot_audit FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (
      company_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.user_id = auth.uid() AND cm.company_id = ai_copilot_audit.company_id
      )
    )
  );

CREATE INDEX IF NOT EXISTS ai_copilot_audit_user_time_idx
  ON public.ai_copilot_audit (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ai_copilot_audit_company_time_idx
  ON public.ai_copilot_audit (company_id, occurred_at DESC);
