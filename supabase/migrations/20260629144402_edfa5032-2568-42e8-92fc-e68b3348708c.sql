
CREATE TABLE public.metric_manual_inputs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  month_key TEXT NOT NULL,
  value NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, metric_key, month_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.metric_manual_inputs TO authenticated;
GRANT ALL ON public.metric_manual_inputs TO service_role;

ALTER TABLE public.metric_manual_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view metric inputs"
  ON public.metric_manual_inputs FOR SELECT
  TO authenticated
  USING (
    company_id IS NULL AND user_id = auth.uid()
    OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Company members can insert metric inputs"
  ON public.metric_manual_inputs FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND (
      company_id IS NULL
      OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Company members can update metric inputs"
  ON public.metric_manual_inputs FOR UPDATE
  TO authenticated
  USING (
    company_id IS NULL AND user_id = auth.uid()
    OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Company members can delete metric inputs"
  ON public.metric_manual_inputs FOR DELETE
  TO authenticated
  USING (
    company_id IS NULL AND user_id = auth.uid()
    OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

CREATE TRIGGER set_metric_manual_inputs_updated_at
  BEFORE UPDATE ON public.metric_manual_inputs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
