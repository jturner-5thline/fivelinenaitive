-- Add info request email notification preference to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS notify_info_request_emails boolean NOT NULL DEFAULT true;