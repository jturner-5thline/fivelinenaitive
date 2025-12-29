-- Add milestone notification preferences to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notify_activity_milestone_added boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_activity_milestone_completed boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_activity_milestone_missed boolean NOT NULL DEFAULT true;

-- Remove deal_created preference (keep column but we won't use it)
-- We'll handle this in the app by not showing deal_created in notifications