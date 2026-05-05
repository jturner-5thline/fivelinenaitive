-- Enum for advance reason categories
DO $$ BEGIN
  CREATE TYPE public.advance_reason_category AS ENUM (
    'budget_confirmed',
    'champion_identified',
    'timeline_locked',
    'technical_fit',
    'executive_sponsor',
    'competitive_win',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table
CREATE TABLE IF NOT EXISTS public.deal_advance_reasons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  reason_category public.advance_reason_category NOT NULL,
  reason_notes TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_advance_reasons_deal_id ON public.deal_advance_reasons(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_advance_reasons_created_at ON public.deal_advance_reasons(created_at);
CREATE INDEX IF NOT EXISTS idx_deal_advance_reasons_category ON public.deal_advance_reasons(reason_category);

ALTER TABLE public.deal_advance_reasons ENABLE ROW LEVEL SECURITY;

-- RLS: visibility follows the underlying deal's visibility.
CREATE POLICY "View advance reasons for visible deals"
ON public.deal_advance_reasons
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_advance_reasons.deal_id)
);

CREATE POLICY "Create advance reasons for visible deals"
ON public.deal_advance_reasons
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_advance_reasons.deal_id)
);

CREATE POLICY "Update own advance reasons"
ON public.deal_advance_reasons
FOR UPDATE
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Delete own advance reasons"
ON public.deal_advance_reasons
FOR DELETE
TO authenticated
USING (created_by = auth.uid());

-- Weekly rollup view
CREATE OR REPLACE VIEW public.v_weekly_advance_reasons
WITH (security_invoker = true)
AS
WITH bounds AS (
  SELECT
    date_trunc('week', now())::timestamptz AS this_week_start,
    (date_trunc('week', now()) + interval '7 days')::timestamptz AS next_week_start,
    (date_trunc('week', now()) - interval '7 days')::timestamptz AS last_week_start
)
SELECT
  r.reason_category,
  COUNT(*) FILTER (
    WHERE r.created_at >= b.this_week_start AND r.created_at < b.next_week_start
  )::int AS this_week_count,
  COUNT(*) FILTER (
    WHERE r.created_at >= b.last_week_start AND r.created_at < b.this_week_start
  )::int AS last_week_count
FROM public.deal_advance_reasons r
CROSS JOIN bounds b
WHERE r.created_at >= b.last_week_start
GROUP BY r.reason_category;