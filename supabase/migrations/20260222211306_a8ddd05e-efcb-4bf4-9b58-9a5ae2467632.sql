
-- Zapier webhook configurations per user
CREATE TABLE public.zapier_webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  company_id UUID REFERENCES public.companies(id),
  label TEXT NOT NULL DEFAULT 'My Zapier Webhook',
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  event_types TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups by user
CREATE INDEX idx_zapier_webhooks_user_id ON public.zapier_webhooks(user_id);
CREATE INDEX idx_zapier_webhooks_active ON public.zapier_webhooks(is_active) WHERE is_active = true;

-- Updated_at trigger
CREATE TRIGGER update_zapier_webhooks_updated_at
  BEFORE UPDATE ON public.zapier_webhooks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.zapier_webhooks ENABLE ROW LEVEL SECURITY;

-- Users can manage their own webhooks
CREATE POLICY "Users can view own zapier webhooks"
  ON public.zapier_webhooks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own zapier webhooks"
  ON public.zapier_webhooks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own zapier webhooks"
  ON public.zapier_webhooks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own zapier webhooks"
  ON public.zapier_webhooks FOR DELETE
  USING (auth.uid() = user_id);

-- Zapier webhook delivery log
CREATE TABLE public.zapier_webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID REFERENCES public.zapier_webhooks(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  status_code INTEGER,
  response_body TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_zapier_webhook_logs_webhook_id ON public.zapier_webhook_logs(webhook_id);
CREATE INDEX idx_zapier_webhook_logs_created_at ON public.zapier_webhook_logs(created_at DESC);

ALTER TABLE public.zapier_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own webhook logs"
  ON public.zapier_webhook_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.zapier_webhooks w
      WHERE w.id = zapier_webhook_logs.webhook_id
        AND w.user_id = auth.uid()
    )
  );

-- Service role can insert logs (from edge function)
CREATE POLICY "Service role can insert webhook logs"
  ON public.zapier_webhook_logs FOR INSERT
  WITH CHECK (true);
