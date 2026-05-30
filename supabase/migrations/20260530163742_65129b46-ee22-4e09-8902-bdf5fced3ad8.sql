
ALTER TABLE public.deal_stage_history
  ADD COLUMN IF NOT EXISTS exited_at timestamptz;

CREATE OR REPLACE VIEW public.v_deal_stage_transitions AS
SELECT
  deal_id,
  pipeline_id,
  LAG(to_stage_id) OVER w AS from_stage_id,
  to_stage_id,
  changed_at AS entered_at,
  COALESCE(exited_at, LEAD(changed_at) OVER w) AS exited_at,
  (COALESCE(exited_at, LEAD(changed_at) OVER w) - changed_at) AS duration
FROM public.deal_stage_history
WHERE to_stage_id IS NOT NULL
WINDOW w AS (PARTITION BY deal_id ORDER BY changed_at);

GRANT SELECT ON public.v_deal_stage_transitions TO authenticated, service_role;
