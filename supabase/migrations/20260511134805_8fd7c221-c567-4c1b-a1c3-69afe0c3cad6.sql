CREATE TABLE IF NOT EXISTS public.widget_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
  special_widgets jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.widget_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own widget preferences"
ON public.widget_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own widget preferences"
ON public.widget_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own widget preferences"
ON public.widget_preferences FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own widget preferences"
ON public.widget_preferences FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_widget_preferences_updated_at
BEFORE UPDATE ON public.widget_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();