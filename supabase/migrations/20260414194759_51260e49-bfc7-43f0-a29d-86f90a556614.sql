
-- Create a table for persisting user UI preferences
CREATE TABLE public.user_ui_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, preference_key)
);

-- Enable Row Level Security
ALTER TABLE public.user_ui_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only access their own preferences
CREATE POLICY "Users can view own preferences"
ON public.user_ui_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own preferences"
ON public.user_ui_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
ON public.user_ui_preferences FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own preferences"
ON public.user_ui_preferences FOR DELETE
USING (auth.uid() = user_id);

-- Auto-update timestamp
CREATE TRIGGER update_user_ui_preferences_updated_at
BEFORE UPDATE ON public.user_ui_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
