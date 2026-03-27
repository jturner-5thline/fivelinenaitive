
CREATE TABLE public.user_dashboard_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, preference_key, company_id)
);

ALTER TABLE public.user_dashboard_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "udp_select" ON public.user_dashboard_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "udp_insert" ON public.user_dashboard_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid()));

CREATE POLICY "udp_update" ON public.user_dashboard_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "udp_delete" ON public.user_dashboard_preferences FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_user_dashboard_preferences_updated_at
  BEFORE UPDATE ON public.user_dashboard_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
