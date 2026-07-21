
CREATE TABLE public.admin_agent_knowledge_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  agent_key text NOT NULL DEFAULT 'admin_agent',
  score integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  tag_filter text[] NOT NULL DEFAULT '{}',
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_agent_knowledge_test_runs_company
  ON public.admin_agent_knowledge_test_runs (company_id, created_at DESC);

GRANT SELECT, INSERT ON public.admin_agent_knowledge_test_runs TO authenticated;
GRANT ALL ON public.admin_agent_knowledge_test_runs TO service_role;

ALTER TABLE public.admin_agent_knowledge_test_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their company's KB test runs"
  ON public.admin_agent_knowledge_test_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = admin_agent_knowledge_test_runs.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert KB test runs for their company"
  ON public.admin_agent_knowledge_test_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = admin_agent_knowledge_test_runs.company_id
        AND cm.user_id = auth.uid()
    )
  );
