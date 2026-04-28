-- Reconcile existing email_labels and add assignments

-- 1) Upgrade existing email_labels
ALTER TABLE public.email_labels
  ADD COLUMN IF NOT EXISTS icon text NULL,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

-- Backfill sort_order from any pre-existing position column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'email_labels' AND column_name = 'position'
  ) THEN
    EXECUTE 'UPDATE public.email_labels SET sort_order = COALESCE(position, 0) WHERE sort_order = 0';
  END IF;
END $$;

-- Ensure name is NOT NULL and within length bounds
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'email_labels_name_len'
  ) THEN
    ALTER TABLE public.email_labels
      ADD CONSTRAINT email_labels_name_len
      CHECK (char_length(btrim(name)) BETWEEN 1 AND 32);
  END IF;
END $$;

-- Set color default if not present already (safe to re-run)
ALTER TABLE public.email_labels ALTER COLUMN color SET DEFAULT 'slate';

-- Case-insensitive uniqueness per user
CREATE UNIQUE INDEX IF NOT EXISTS email_labels_user_lower_name_uq
  ON public.email_labels (user_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS email_labels_user_sort_idx
  ON public.email_labels (user_id, sort_order, name);

-- Auto-fill company_id from caller's primary company on insert
CREATE OR REPLACE FUNCTION public.set_email_labels_company_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.company_id := public.get_user_company_id(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_labels_company_id ON public.email_labels;
CREATE TRIGGER trg_email_labels_company_id
  BEFORE INSERT ON public.email_labels
  FOR EACH ROW EXECUTE FUNCTION public.set_email_labels_company_id();

DROP TRIGGER IF EXISTS trg_email_labels_updated_at ON public.email_labels;
CREATE TRIGGER trg_email_labels_updated_at
  BEFORE UPDATE ON public.email_labels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Assignments table (thread-first, optional message_id override)
CREATE TABLE IF NOT EXISTS public.email_label_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label_id uuid NOT NULL REFERENCES public.email_labels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  thread_id text NOT NULL,
  message_id text NULL,
  applied_by uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_label_assignments_thread_uq
  ON public.email_label_assignments (label_id, thread_id)
  WHERE message_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS email_label_assignments_message_uq
  ON public.email_label_assignments (label_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_label_assignments_user_thread_idx
  ON public.email_label_assignments (user_id, thread_id);

CREATE INDEX IF NOT EXISTS email_label_assignments_label_applied_idx
  ON public.email_label_assignments (label_id, applied_at DESC);

-- 3) RLS
ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_label_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view their own labels" ON public.email_labels;
DROP POLICY IF EXISTS "Users create their own labels" ON public.email_labels;
DROP POLICY IF EXISTS "Users update their own labels" ON public.email_labels;
DROP POLICY IF EXISTS "Users delete their own labels" ON public.email_labels;

CREATE POLICY "Users view their own labels"
  ON public.email_labels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create their own labels"
  ON public.email_labels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own labels"
  ON public.email_labels FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own labels"
  ON public.email_labels FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view their own label assignments" ON public.email_label_assignments;
DROP POLICY IF EXISTS "Users create their own label assignments" ON public.email_label_assignments;
DROP POLICY IF EXISTS "Users update their own label assignments" ON public.email_label_assignments;
DROP POLICY IF EXISTS "Users delete their own label assignments" ON public.email_label_assignments;

CREATE POLICY "Users view their own label assignments"
  ON public.email_label_assignments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users create their own label assignments"
  ON public.email_label_assignments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND auth.uid() = applied_by
    AND EXISTS (
      SELECT 1 FROM public.email_labels l
      WHERE l.id = label_id AND l.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update their own label assignments"
  ON public.email_label_assignments FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own label assignments"
  ON public.email_label_assignments FOR DELETE
  USING (auth.uid() = user_id);