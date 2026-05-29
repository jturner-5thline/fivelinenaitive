CREATE TABLE IF NOT EXISTS public.funding_source_acquisition_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  year integer NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('monthly','quarterly')),
  period integer NOT NULL,
  target_count integer NOT NULL DEFAULT 0 CHECK (target_count >= 0),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT funding_source_acquisition_plans_period_range
    CHECK (
      (cadence = 'monthly'   AND period BETWEEN 1 AND 12) OR
      (cadence = 'quarterly' AND period BETWEEN 1 AND 4)
    ),
  CONSTRAINT funding_source_acquisition_plans_unique
    UNIQUE (tenant_id, year, cadence, period)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.funding_source_acquisition_plans TO authenticated;
GRANT ALL ON public.funding_source_acquisition_plans TO service_role;

ALTER TABLE public.funding_source_acquisition_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read their acquisition plan"
ON public.funding_source_acquisition_plans
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = funding_source_acquisition_plans.tenant_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Tenant members can insert their acquisition plan"
ON public.funding_source_acquisition_plans
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = funding_source_acquisition_plans.tenant_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Tenant members can update their acquisition plan"
ON public.funding_source_acquisition_plans
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = funding_source_acquisition_plans.tenant_id
      AND cm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = funding_source_acquisition_plans.tenant_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Tenant members can delete their acquisition plan"
ON public.funding_source_acquisition_plans
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = funding_source_acquisition_plans.tenant_id
      AND cm.user_id = auth.uid()
  )
);

CREATE TRIGGER trg_funding_source_acquisition_plans_updated_at
BEFORE UPDATE ON public.funding_source_acquisition_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_funding_source_plans_tenant_year
  ON public.funding_source_acquisition_plans (tenant_id, year, cadence);