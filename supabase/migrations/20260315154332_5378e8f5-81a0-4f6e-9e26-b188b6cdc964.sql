
CREATE TABLE public.dashboard_grid_layouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  dashboard_id TEXT NOT NULL,
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, dashboard_id)
);

ALTER TABLE public.dashboard_grid_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own layouts"
  ON public.dashboard_grid_layouts
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_dashboard_grid_layouts_updated_at
  BEFORE UPDATE ON public.dashboard_grid_layouts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
