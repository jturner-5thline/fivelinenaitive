
-- Create a trigger function that auto-populates company_id from user_id on insert
CREATE OR REPLACE FUNCTION public.set_company_id_from_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.company_id := public.get_user_company_id(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Apply trigger to all analytics tables that have both user_id and company_id
CREATE TRIGGER set_company_id_page_views BEFORE INSERT ON public.page_views
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

CREATE TRIGGER set_company_id_ux_client_errors BEFORE INSERT ON public.ux_client_errors
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

CREATE TRIGGER set_company_id_ux_feature_usage BEFORE INSERT ON public.ux_feature_usage
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

CREATE TRIGGER set_company_id_ux_search_events BEFORE INSERT ON public.ux_search_events
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

CREATE TRIGGER set_company_id_ux_user_feedback BEFORE INSERT ON public.ux_user_feedback
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

CREATE TRIGGER set_company_id_ux_accessibility BEFORE INSERT ON public.ux_accessibility_issues
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

-- For tables without user_id (ux_rage_clicks, ux_click_heatmap, ux_navigation_events, ux_performance_metrics)
-- these have session_id only. We need a different approach: add user_id columns if missing, 
-- or rely on the inserting code to provide company_id.
-- Since these are inserted via service_role edge functions, we need to ensure the edge functions pass company_id.

-- Add user_id to tables that don't have it
ALTER TABLE public.ux_rage_clicks ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.ux_click_heatmap ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.ux_navigation_events ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.ux_performance_metrics ADD COLUMN IF NOT EXISTS user_id uuid;

-- Add triggers for these tables too
CREATE TRIGGER set_company_id_ux_rage_clicks BEFORE INSERT ON public.ux_rage_clicks
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

CREATE TRIGGER set_company_id_ux_click_heatmap BEFORE INSERT ON public.ux_click_heatmap
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

CREATE TRIGGER set_company_id_ux_navigation BEFORE INSERT ON public.ux_navigation_events
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();

CREATE TRIGGER set_company_id_ux_performance BEFORE INSERT ON public.ux_performance_metrics
FOR EACH ROW EXECUTE FUNCTION public.set_company_id_from_user();
