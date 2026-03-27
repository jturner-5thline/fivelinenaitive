
-- Add recurrence and decision columns to deals table
ALTER TABLE public.deals 
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS manager_move_forward_decision boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS materials_added_to_naitive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agreement_sent boolean NOT NULL DEFAULT false;

-- Add recurrence_stop_conditions to wf_tasks table
ALTER TABLE public.wf_tasks
  ADD COLUMN IF NOT EXISTS recurrence_stop_conditions jsonb;

-- Add next_follow_up_at to wf_deals table as well (for workflow system deals)
ALTER TABLE public.wf_deals
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS manager_move_forward_decision boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS materials_added_to_naitive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agreement_sent boolean NOT NULL DEFAULT false;
