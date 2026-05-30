
-- Meeting task suggestions: surface Claap / synthesized action items as
-- approve-able task suggestions on the Daily Rundown.
CREATE TABLE IF NOT EXISTS public.meeting_task_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_company_id uuid NOT NULL,
  scope_key text NOT NULL,            -- 'meeting:<uuid>' or 'event:<google_event_id>'
  meeting_id uuid REFERENCES public.claap_meetings(id) ON DELETE CASCADE,
  event_id text,                      -- google calendar event id (when no claap_meetings row)
  recording_id uuid REFERENCES public.claap_recordings(id) ON DELETE SET NULL,
  suggestion_id text NOT NULL,        -- stable hash: scope + index + slug(text)
  text text NOT NULL,
  assignee_email text,
  due_date date,
  source text NOT NULL DEFAULT 'claap' CHECK (source IN ('claap','synthesized')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed','converted')),
  created_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  UNIQUE (scope_key, suggestion_id)
);

CREATE INDEX IF NOT EXISTS idx_mts_scope ON public.meeting_task_suggestions(scope_key);
CREATE INDEX IF NOT EXISTS idx_mts_company ON public.meeting_task_suggestions(org_company_id);
CREATE INDEX IF NOT EXISTS idx_mts_meeting ON public.meeting_task_suggestions(meeting_id) WHERE meeting_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_task_suggestions TO authenticated;
GRANT ALL ON public.meeting_task_suggestions TO service_role;

ALTER TABLE public.meeting_task_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mts select in company"
  ON public.meeting_task_suggestions
  FOR SELECT TO authenticated
  USING (org_company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE POLICY "mts insert in company"
  ON public.meeting_task_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (org_company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE POLICY "mts update in company"
  ON public.meeting_task_suggestions
  FOR UPDATE TO authenticated
  USING (org_company_id = ANY (public.get_user_company_ids(auth.uid())))
  WITH CHECK (org_company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE POLICY "mts delete in company"
  ON public.meeting_task_suggestions
  FOR DELETE TO authenticated
  USING (org_company_id = ANY (public.get_user_company_ids(auth.uid())));

CREATE TRIGGER trg_mts_updated_at
  BEFORE UPDATE ON public.meeting_task_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
