CREATE TABLE IF NOT EXISTS public.asana_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  task_id uuid,
  asana_task_gid text,
  action text NOT NULL,
  success boolean NOT NULL,
  error_message text,
  payload jsonb,
  triggered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asana_sync_log_task ON public.asana_sync_log(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asana_sync_log_company ON public.asana_sync_log(company_id, created_at DESC);

ALTER TABLE public.asana_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can insert asana sync log" ON public.asana_sync_log;
CREATE POLICY "Authenticated can insert asana sync log"
  ON public.asana_sync_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can view their company sync log" ON public.asana_sync_log;
CREATE POLICY "Authenticated can view their company sync log"
  ON public.asana_sync_log FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = auth.uid() AND cm.company_id = asana_sync_log.company_id
    )
  );