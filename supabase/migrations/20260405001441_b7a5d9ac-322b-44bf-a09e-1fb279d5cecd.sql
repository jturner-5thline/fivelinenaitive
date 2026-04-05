
-- Email cache table for storing fetched email metadata
CREATE TABLE public.email_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  thread_id TEXT,
  subject TEXT,
  snippet TEXT,
  body_text TEXT,
  from_email TEXT,
  from_name TEXT,
  to_emails TEXT[],
  cc_emails TEXT[],
  labels TEXT[],
  is_read BOOLEAN DEFAULT true,
  is_starred BOOLEAN DEFAULT false,
  received_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, gmail_message_id)
);

-- Email AI analysis results
CREATE TABLE public.email_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_cache_id UUID NOT NULL REFERENCES public.email_cache(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  deal_name TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  sentiment TEXT NOT NULL DEFAULT 'neutral',
  priority TEXT NOT NULL DEFAULT 'medium',
  summary TEXT,
  suggested_action TEXT,
  follow_up_needed BOOLEAN DEFAULT false,
  follow_up_by DATE,
  extracted_data JSONB DEFAULT '{}'::jsonb,
  signals TEXT[],
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email_cache_id)
);

-- User email intelligence settings (persisted toggles)
CREATE TABLE public.email_intelligence_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  auto_tagging BOOLEAN DEFAULT true,
  sentiment_analysis BOOLEAN DEFAULT true,
  signal_detection BOOLEAN DEFAULT true,
  follow_up_reminders BOOLEAN DEFAULT true,
  thread_summaries BOOLEAN DEFAULT false,
  auto_extract BOOLEAN DEFAULT false,
  tag_rules JSONB DEFAULT '[]'::jsonb,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_email_cache_user_received ON public.email_cache(user_id, received_at DESC);
CREATE INDEX idx_email_analysis_user ON public.email_analysis(user_id);
CREATE INDEX idx_email_analysis_deal ON public.email_analysis(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX idx_email_analysis_follow_up ON public.email_analysis(user_id, follow_up_needed) WHERE follow_up_needed = true;

-- RLS
ALTER TABLE public.email_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_intelligence_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own email cache" ON public.email_cache
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own email analysis" ON public.email_analysis
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own intelligence settings" ON public.email_intelligence_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
