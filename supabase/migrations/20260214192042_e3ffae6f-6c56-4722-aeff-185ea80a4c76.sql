-- Dashboard layouts table for storing user dashboard presets
CREATE TABLE public.dashboard_layouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Dashboard',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  grid_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  widgets_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.dashboard_layouts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own layouts
CREATE POLICY "Users can view their own dashboard layouts"
ON public.dashboard_layouts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own dashboard layouts"
ON public.dashboard_layouts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dashboard layouts"
ON public.dashboard_layouts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dashboard layouts"
ON public.dashboard_layouts FOR DELETE
USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_dashboard_layouts_user_id ON public.dashboard_layouts(user_id);

-- Trigger for updated_at
CREATE TRIGGER update_dashboard_layouts_updated_at
BEFORE UPDATE ON public.dashboard_layouts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
