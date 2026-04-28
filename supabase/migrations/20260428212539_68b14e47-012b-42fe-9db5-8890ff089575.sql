-- Per-user, per-company persistence for Asana Goals filter mapping
CREATE TABLE public.asana_goal_filter_prefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  override JSONB,
  exact_match BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT asana_goal_filter_prefs_user_company_unique UNIQUE (user_id, company_id)
);

ALTER TABLE public.asana_goal_filter_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own asana goal filter prefs"
  ON public.asana_goal_filter_prefs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own asana goal filter prefs"
  ON public.asana_goal_filter_prefs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own asana goal filter prefs"
  ON public.asana_goal_filter_prefs
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own asana goal filter prefs"
  ON public.asana_goal_filter_prefs
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_asana_goal_filter_prefs_updated_at
  BEFORE UPDATE ON public.asana_goal_filter_prefs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_asana_goal_filter_prefs_user_company
  ON public.asana_goal_filter_prefs (user_id, company_id);
