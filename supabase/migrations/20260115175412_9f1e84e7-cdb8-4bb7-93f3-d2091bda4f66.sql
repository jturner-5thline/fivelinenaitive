-- Add notify_flex_alerts column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS notify_flex_alerts boolean NOT NULL DEFAULT true;