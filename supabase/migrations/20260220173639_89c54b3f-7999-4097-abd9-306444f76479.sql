
-- Fix RLS policies for all UX analytics tables to use is_admin() instead of querying auth.users

-- page_views
DROP POLICY IF EXISTS "Admins can read page_views" ON public.page_views;
CREATE POLICY "Admins can read page_views" ON public.page_views FOR SELECT USING (is_admin(auth.uid()));

-- ux_rage_clicks
DROP POLICY IF EXISTS "Admins can read ux_rage_clicks" ON public.ux_rage_clicks;
CREATE POLICY "Admins can read ux_rage_clicks" ON public.ux_rage_clicks FOR SELECT USING (is_admin(auth.uid()));

-- ux_user_feedback
DROP POLICY IF EXISTS "Admins can read ux_user_feedback" ON public.ux_user_feedback;
CREATE POLICY "Admins can read ux_user_feedback" ON public.ux_user_feedback FOR SELECT USING (is_admin(auth.uid()));

-- ux_client_errors
DROP POLICY IF EXISTS "Admins can read ux_client_errors" ON public.ux_client_errors;
CREATE POLICY "Admins can read ux_client_errors" ON public.ux_client_errors FOR SELECT USING (is_admin(auth.uid()));

-- ux_accessibility_issues
DROP POLICY IF EXISTS "Admins can read ux_accessibility_issues" ON public.ux_accessibility_issues;
CREATE POLICY "Admins can read ux_accessibility_issues" ON public.ux_accessibility_issues FOR SELECT USING (is_admin(auth.uid()));

-- ux_search_events
DROP POLICY IF EXISTS "Admins can read ux_search_events" ON public.ux_search_events;
CREATE POLICY "Admins can read ux_search_events" ON public.ux_search_events FOR SELECT USING (is_admin(auth.uid()));

-- ux_performance_metrics
DROP POLICY IF EXISTS "Admins can read ux_performance_metrics" ON public.ux_performance_metrics;
CREATE POLICY "Admins can read ux_performance_metrics" ON public.ux_performance_metrics FOR SELECT USING (is_admin(auth.uid()));

-- ux_navigation_events
DROP POLICY IF EXISTS "Admins can read ux_navigation_events" ON public.ux_navigation_events;
CREATE POLICY "Admins can read ux_navigation_events" ON public.ux_navigation_events FOR SELECT USING (is_admin(auth.uid()));
