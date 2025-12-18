-- Create activity_logs table for real deal activity tracking
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view activity for their deals"
ON public.activity_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = activity_logs.deal_id
    AND deals.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create activity for their deals"
ON public.activity_logs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM deals
    WHERE deals.id = activity_logs.deal_id
    AND deals.user_id = auth.uid()
  )
);

-- Create index for faster queries
CREATE INDEX idx_activity_logs_deal_id ON public.activity_logs(deal_id);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

-- Enable realtime for activity logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;