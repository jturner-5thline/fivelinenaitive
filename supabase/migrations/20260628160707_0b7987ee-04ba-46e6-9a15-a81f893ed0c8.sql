
CREATE TABLE IF NOT EXISTS public.sales_calls_cache (
  company_id UUID NOT NULL,
  year INT NOT NULL,
  payload JSONB NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, year)
);

GRANT SELECT ON public.sales_calls_cache TO authenticated;
GRANT ALL ON public.sales_calls_cache TO service_role;

ALTER TABLE public.sales_calls_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read their company sales calls cache"
  ON public.sales_calls_cache FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = sales_calls_cache.company_id
        AND cm.user_id = auth.uid()
    )
  );
