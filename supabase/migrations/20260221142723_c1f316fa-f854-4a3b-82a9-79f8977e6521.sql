CREATE TABLE public.email_snippets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  is_shared BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.email_snippets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snippets" ON public.email_snippets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own snippets" ON public.email_snippets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own snippets" ON public.email_snippets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own snippets" ON public.email_snippets
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_email_snippets_updated_at
  BEFORE UPDATE ON public.email_snippets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();