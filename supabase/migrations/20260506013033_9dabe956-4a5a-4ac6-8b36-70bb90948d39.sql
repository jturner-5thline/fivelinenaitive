CREATE TABLE public.qir_comment_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  report_key TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolved_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, report_key, target_type, target_id)
);

CREATE INDEX idx_qir_comment_threads_company ON public.qir_comment_threads (company_id, report_key);

ALTER TABLE public.qir_comment_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can read qir comment threads"
ON public.qir_comment_threads FOR SELECT TO authenticated
USING (company_id = ANY (get_user_company_ids(auth.uid())));

CREATE POLICY "Company members can insert qir comment threads"
ON public.qir_comment_threads FOR INSERT TO authenticated
WITH CHECK (company_id = ANY (get_user_company_ids(auth.uid())));

CREATE POLICY "Company members can update qir comment threads"
ON public.qir_comment_threads FOR UPDATE TO authenticated
USING (company_id = ANY (get_user_company_ids(auth.uid())));

CREATE POLICY "Company members can delete qir comment threads"
ON public.qir_comment_threads FOR DELETE TO authenticated
USING (company_id = ANY (get_user_company_ids(auth.uid())));

CREATE TRIGGER trg_qir_comment_threads_updated_at
BEFORE UPDATE ON public.qir_comment_threads
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.qir_comment_threads;