
-- Table to store Discover page onboarding preferences
CREATE TABLE public.news_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  industries TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  preferred_sources TEXT[] DEFAULT '{}',
  default_layout TEXT NOT NULL DEFAULT 'grid',
  default_tab TEXT NOT NULL DEFAULT 'all',
  digest_frequency TEXT DEFAULT 'none',
  digest_max_articles INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.news_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
ON public.news_preferences FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON public.news_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.news_preferences FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_news_preferences_updated_at
BEFORE UPDATE ON public.news_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
