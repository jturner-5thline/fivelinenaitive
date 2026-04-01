
ALTER TABLE public.ai_usage_logs 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'success',
ADD COLUMN IF NOT EXISTS error_message text;
