-- Add notification bell preferences to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notify_stale_alerts BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_activity_deal_created BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_activity_lender_added BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_activity_lender_updated BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_activity_stage_changed BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notify_activity_status_changed BOOLEAN NOT NULL DEFAULT true;