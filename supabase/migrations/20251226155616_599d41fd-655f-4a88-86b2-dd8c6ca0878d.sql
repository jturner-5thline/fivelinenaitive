-- Create table to track read notifications
CREATE TABLE public.notification_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  notification_type TEXT NOT NULL, -- 'activity' or 'stale_alert'
  notification_id TEXT NOT NULL, -- activity_log id or deal_id for stale alerts
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_type, notification_id)
);

-- Enable RLS
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

-- Users can view their own read notifications
CREATE POLICY "Users can view their own notification reads"
ON public.notification_reads
FOR SELECT
USING (auth.uid() = user_id);

-- Users can mark notifications as read
CREATE POLICY "Users can mark notifications as read"
ON public.notification_reads
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own read records (for cleanup)
CREATE POLICY "Users can delete their own notification reads"
ON public.notification_reads
FOR DELETE
USING (auth.uid() = user_id);