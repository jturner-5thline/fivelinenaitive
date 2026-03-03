
-- Create table for tracking interest in coming soon integrations
CREATE TABLE public.integration_interest (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  integration_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, integration_key)
);

ALTER TABLE public.integration_interest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own interest" ON public.integration_interest
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own interest" ON public.integration_interest
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own interest" ON public.integration_interest
  FOR DELETE USING (auth.uid() = user_id);
