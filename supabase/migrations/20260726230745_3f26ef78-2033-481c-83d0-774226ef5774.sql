
-- Enum for rundown item status
DO $$ BEGIN
  CREATE TYPE public.daily_rundown_status AS ENUM ('pending', 'complete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper: is caller the authorized rundown user (jturner@5thline.co)?
CREATE OR REPLACE FUNCTION public.is_rundown_authorized_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT lower(coalesce(
    (auth.jwt() ->> 'email'),
    (SELECT email FROM auth.users WHERE id = auth.uid())
  )) = 'jturner@5thline.co'
$$;

-- Main table
CREATE TABLE IF NOT EXISTS public.daily_rundown_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  workspace_id UUID NULL,
  title TEXT NOT NULL,
  content TEXT NULL,
  status public.daily_rundown_status NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'user',
  created_by UUID NULL,
  updated_by UUID NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_rundown_items_user_sort
  ON public.daily_rundown_items (user_id, sort_order, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_rundown_items TO authenticated;
GRANT ALL ON public.daily_rundown_items TO service_role;

ALTER TABLE public.daily_rundown_items ENABLE ROW LEVEL SECURITY;

-- Only jturner can see/edit their own rundown rows
CREATE POLICY "rundown_owner_select"
  ON public.daily_rundown_items FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND public.is_rundown_authorized_user());

CREATE POLICY "rundown_owner_insert"
  ON public.daily_rundown_items FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_rundown_authorized_user());

CREATE POLICY "rundown_owner_update"
  ON public.daily_rundown_items FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND public.is_rundown_authorized_user())
  WITH CHECK (user_id = auth.uid() AND public.is_rundown_authorized_user());

CREATE POLICY "rundown_owner_delete"
  ON public.daily_rundown_items FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND public.is_rundown_authorized_user());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_daily_rundown_items_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'complete' AND (OLD.status IS DISTINCT FROM 'complete') THEN
    NEW.completed_at := now();
  ELSIF NEW.status = 'pending' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS daily_rundown_items_touch ON public.daily_rundown_items;
CREATE TRIGGER daily_rundown_items_touch
  BEFORE UPDATE ON public.daily_rundown_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_daily_rundown_items_touch();

-- Audit log
CREATE TABLE IF NOT EXISTS public.daily_rundown_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_email TEXT NULL,
  action TEXT NOT NULL,
  initiated_by TEXT NOT NULL DEFAULT 'user',
  item_id UUID NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_rundown_audit_user_time
  ON public.daily_rundown_audit_log (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.daily_rundown_audit_log TO authenticated;
GRANT ALL ON public.daily_rundown_audit_log TO service_role;

ALTER TABLE public.daily_rundown_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rundown_audit_owner_select"
  ON public.daily_rundown_audit_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND public.is_rundown_authorized_user());

CREATE POLICY "rundown_audit_owner_insert"
  ON public.daily_rundown_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_rundown_authorized_user());
