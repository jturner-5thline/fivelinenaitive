
-- Add priority, assigned_to, and position columns to outstanding_items
ALTER TABLE public.outstanding_items 
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS assigned_to text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- Update existing rows to set position based on created_at order
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY deal_id ORDER BY created_at ASC) as rn
  FROM public.outstanding_items
)
UPDATE public.outstanding_items oi
SET position = ordered.rn
FROM ordered
WHERE oi.id = ordered.id;
