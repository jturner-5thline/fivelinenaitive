CREATE TABLE IF NOT EXISTS public.end_of_day_clears (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  item_id TEXT NOT NULL,
  cleared_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_end_of_day_clears_user ON public.end_of_day_clears (user_id);

ALTER TABLE public.end_of_day_clears ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own EOD clears"
  ON public.end_of_day_clears FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own EOD clears"
  ON public.end_of_day_clears FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own EOD clears"
  ON public.end_of_day_clears FOR DELETE
  USING (auth.uid() = user_id);
