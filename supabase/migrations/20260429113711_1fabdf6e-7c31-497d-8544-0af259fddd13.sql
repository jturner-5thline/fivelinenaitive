-- Table to persist task duplicate-check candidates for human review
CREATE TABLE public.task_duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  candidate_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  canonical_task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('duplicate','related','distinct','needs_review')),
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_explanation text,
  suggested_action text CHECK (suggested_action IN ('consolidate','mark_related','keep_separate','manual_review')),
  compared_task_ids uuid[] NOT NULL DEFAULT '{}',
  trigger_source text NOT NULL DEFAULT 'client',  -- 'client' | 'db_trigger'
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_action text,  -- 'consolidated','dismissed','marked_related','kept_separate'
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed','consolidated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tdc_company ON public.task_duplicate_candidates(company_id);
CREATE INDEX idx_tdc_candidate ON public.task_duplicate_candidates(candidate_task_id);
CREATE INDEX idx_tdc_canonical ON public.task_duplicate_candidates(canonical_task_id);
CREATE INDEX idx_tdc_status ON public.task_duplicate_candidates(status) WHERE status = 'pending';

ALTER TABLE public.task_duplicate_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their company task dup candidates"
ON public.task_duplicate_candidates FOR SELECT TO authenticated
USING (company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE POLICY "Members insert task dup candidates for their company"
ON public.task_duplicate_candidates FOR INSERT TO authenticated
WITH CHECK (company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE POLICY "Members update task dup candidates for their company"
ON public.task_duplicate_candidates FOR UPDATE TO authenticated
USING (company_id = ANY (public.get_user_company_ids(auth.uid())))
WITH CHECK (company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE POLICY "Members delete task dup candidates for their company"
ON public.task_duplicate_candidates FOR DELETE TO authenticated
USING (company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE TRIGGER trg_tdc_updated_at
BEFORE UPDATE ON public.task_duplicate_candidates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to fire the edge function on task INSERT/UPDATE (title, description, links, status)
CREATE OR REPLACE FUNCTION public.notify_task_duplicate_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  should_check boolean := false;
BEGIN
  -- Skip if no company or completed/archived
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IN ('complete','completed') THEN RETURN NEW; END IF;
  IF NEW.archived_at IS NOT NULL THEN RETURN NEW; END IF;
  -- Only check tasks linked to at least one entity
  IF NEW.deal_id IS NULL AND NEW.contact_id IS NULL AND NEW.crm_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    should_check := true;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.title IS DISTINCT FROM NEW.title
       OR OLD.description IS DISTINCT FROM NEW.description
       OR OLD.deal_id IS DISTINCT FROM NEW.deal_id
       OR OLD.contact_id IS DISTINCT FROM NEW.contact_id
       OR OLD.crm_company_id IS DISTINCT FROM NEW.crm_company_id THEN
      should_check := true;
    END IF;
  END IF;

  IF should_check THEN
    PERFORM net.http_post(
      url := 'https://tgkksvazruzbghssnxde.supabase.co/functions/v1/task-duplicate-check',
      headers := jsonb_build_object('Content-Type','application/json','x-trigger-source','db_trigger'),
      body := jsonb_build_object('task_id', NEW.id, 'trigger_source', 'db_trigger')
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_duplicate_check
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_duplicate_check();