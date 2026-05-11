UPDATE public.deal_pipelines
SET stages = (
  SELECT jsonb_agg(
    CASE WHEN stage->>'id' = 'fs-closed-won'
      THEN jsonb_set(stage, '{label}', '"Active Client"')
      ELSE stage
    END
  )
  FROM jsonb_array_elements(stages) AS stage
)
WHERE name = 'FinServ Pipeline';