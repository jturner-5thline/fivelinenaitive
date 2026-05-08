
-- 1. Add demo/trial columns to companies (idempotent)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS account_type text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- 2. Add is_active to profiles for soft-deactivation (revoke)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 3. Activity log table
CREATE TABLE IF NOT EXISTS public.user_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_log_company_created
  ON public.user_activity_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_created
  ON public.user_activity_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_event_type
  ON public.user_activity_log (event_type);

ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert their own activity"     ON public.user_activity_log;
DROP POLICY IF EXISTS "Users can read their own activity"       ON public.user_activity_log;
DROP POLICY IF EXISTS "Admins can read all activity"            ON public.user_activity_log;
DROP POLICY IF EXISTS "Company admins can read company activity" ON public.user_activity_log;

CREATE POLICY "Users can insert their own activity"
  ON public.user_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own activity"
  ON public.user_activity_log FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all activity"
  ON public.user_activity_log FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Company admins can read company activity"
  ON public.user_activity_log FOR SELECT
  TO authenticated
  USING (company_id IS NOT NULL AND public.is_company_admin(auth.uid(), company_id));
