-- Persistent AI summaries attached to saved reports + ad-hoc Insights snapshots.
CREATE TABLE public.report_ai_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id uuid REFERENCES public.report_definitions(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  /** Stable identifier for the period the snapshot represents,
      e.g. "2026-04" or "qtd:2026-04-01_2026-06-30". */
  period_key text NOT NULL,
  period_label text NOT NULL,
  narrative text NOT NULL,
  /** JSON snapshot of the deltas + alerts that produced this narrative. */
  deltas jsonb NOT NULL DEFAULT '[]'::jsonb,
  alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  /** Set when the user explicitly locked this summary into a saved report. */
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_ai_summaries_report ON public.report_ai_summaries(report_id);
CREATE INDEX idx_report_ai_summaries_owner ON public.report_ai_summaries(owner_user_id);
CREATE INDEX idx_report_ai_summaries_period ON public.report_ai_summaries(period_key);

ALTER TABLE public.report_ai_summaries ENABLE ROW LEVEL SECURITY;

-- Owner full access
CREATE POLICY "Owners manage own AI summaries"
  ON public.report_ai_summaries
  FOR ALL
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- View summaries that belong to a report you can see (org or shared)
CREATE POLICY "View AI summaries for accessible reports"
  ON public.report_ai_summaries
  FOR SELECT
  TO authenticated
  USING (
    report_id IS NOT NULL AND report_id IN (
      SELECT id FROM public.report_definitions
      WHERE
        owner_user_id = auth.uid()
        OR (visibility = 'org' AND company_id IN (
          SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
        ))
        OR auth.uid() = ANY(shared_with_user_ids)
    )
  );

CREATE TRIGGER update_report_ai_summaries_updated_at
BEFORE UPDATE ON public.report_ai_summaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();