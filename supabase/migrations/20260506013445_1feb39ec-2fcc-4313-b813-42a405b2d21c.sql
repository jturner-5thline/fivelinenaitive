CREATE TABLE public.qir_thread_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  report_key TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('resolved','reopened')),
  actor_user_id UUID NOT NULL,
  actor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qir_thread_events_target
  ON public.qir_thread_events (company_id, report_key, target_type, target_id, created_at DESC);

ALTER TABLE public.qir_thread_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read qir thread events"
ON public.qir_thread_events FOR SELECT TO authenticated
USING (company_id = ANY (get_user_company_ids(auth.uid())));

CREATE POLICY "Company members can insert qir thread events"
ON public.qir_thread_events FOR INSERT TO authenticated
WITH CHECK (
  company_id = ANY (get_user_company_ids(auth.uid()))
  AND actor_user_id = auth.uid()
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.qir_thread_events;