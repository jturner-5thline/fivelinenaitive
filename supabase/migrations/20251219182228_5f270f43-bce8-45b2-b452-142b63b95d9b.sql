-- Add notification preferences columns to profiles
ALTER TABLE public.profiles
ADD COLUMN email_notifications boolean NOT NULL DEFAULT true,
ADD COLUMN deal_updates_email boolean NOT NULL DEFAULT true,
ADD COLUMN lender_updates_email boolean NOT NULL DEFAULT true,
ADD COLUMN weekly_summary_email boolean NOT NULL DEFAULT true,
ADD COLUMN in_app_notifications boolean NOT NULL DEFAULT true,
ADD COLUMN deal_updates_app boolean NOT NULL DEFAULT true,
ADD COLUMN lender_updates_app boolean NOT NULL DEFAULT true;