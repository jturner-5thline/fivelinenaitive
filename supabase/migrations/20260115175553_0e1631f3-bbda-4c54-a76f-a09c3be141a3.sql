-- Create flex_notifications table for in-app FLEx alerts
CREATE TABLE public.flex_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  lender_name TEXT,
  lender_email TEXT,
  engagement_score INTEGER,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.flex_notifications ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own flex notifications"
  ON public.flex_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own flex notifications"
  ON public.flex_notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert flex notifications"
  ON public.flex_notifications FOR INSERT
  WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_flex_notifications_user_id ON public.flex_notifications(user_id);
CREATE INDEX idx_flex_notifications_created_at ON public.flex_notifications(created_at DESC);