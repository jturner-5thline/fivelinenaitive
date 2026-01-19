-- Create table for user quick prompts
CREATE TABLE public.user_quick_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  category TEXT DEFAULT 'custom',
  icon TEXT DEFAULT 'sparkles',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_quick_prompts ENABLE ROW LEVEL SECURITY;

-- Users can view their own prompts
CREATE POLICY "Users can view their own prompts"
ON public.user_quick_prompts
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own prompts
CREATE POLICY "Users can create their own prompts"
ON public.user_quick_prompts
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own prompts
CREATE POLICY "Users can update their own prompts"
ON public.user_quick_prompts
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own prompts
CREATE POLICY "Users can delete their own prompts"
ON public.user_quick_prompts
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_quick_prompts_updated_at
BEFORE UPDATE ON public.user_quick_prompts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();