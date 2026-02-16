
-- Fix agent_suggestion_stats view
DROP VIEW IF EXISTS public.agent_suggestion_stats;
CREATE VIEW public.agent_suggestion_stats
WITH (security_invoker = true)
AS
SELECT 
  suggestion_category,
  suggestion_priority,
  count(*) FILTER (WHERE action_type = 'viewed') AS view_count,
  count(*) FILTER (WHERE action_type = 'applied') AS apply_count,
  count(*) FILTER (WHERE action_type = 'dismissed') AS dismiss_count,
  count(*) FILTER (WHERE action_type = 'deep_dive_opened') AS deep_dive_count,
  round(count(*) FILTER (WHERE action_type = 'applied')::numeric / NULLIF(count(*) FILTER (WHERE action_type = ANY (ARRAY['applied', 'dismissed'])), 0)::numeric * 100, 2) AS apply_rate_percent,
  avg(time_to_action_seconds) FILTER (WHERE action_type = ANY (ARRAY['applied', 'dismissed'])) AS avg_decision_time_seconds
FROM agent_suggestion_analytics
GROUP BY suggestion_category, suggestion_priority;

-- agent_suggestions: service_role only
DROP POLICY IF EXISTS "System can insert agent suggestions" ON public.agent_suggestions;
CREATE POLICY "Service role can insert agent suggestions"
  ON public.agent_suggestions FOR INSERT TO service_role WITH CHECK (true);

-- deal_info_requests: UPDATE scoped to owner
DROP POLICY IF EXISTS "Users can update info requests" ON public.deal_info_requests;
CREATE POLICY "Users can update own info requests"
  ON public.deal_info_requests FOR UPDATE TO authenticated
  USING (requester_user_id = auth.uid()::text);

-- error_logs: scope INSERT to user
DROP POLICY IF EXISTS "Anyone can insert error logs" ON public.error_logs;
CREATE POLICY "Authenticated users can insert own error logs"
  ON public.error_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- flex_info_notifications: service_role only  
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.flex_info_notifications;
CREATE POLICY "Service role only can insert notifications"
  ON public.flex_info_notifications FOR INSERT TO service_role WITH CHECK (true);

-- flex_notifications: service_role only
DROP POLICY IF EXISTS "Service role can insert flex notifications" ON public.flex_notifications;
CREATE POLICY "Service role only can insert flex notifications"
  ON public.flex_notifications FOR INSERT TO service_role WITH CHECK (true);

-- integration_logs: service_role only (no user_id column)
DROP POLICY IF EXISTS "System can insert integration logs" ON public.integration_logs;
CREATE POLICY "Service role can insert integration logs"
  ON public.integration_logs FOR INSERT TO service_role WITH CHECK (true);

-- page_views: service_role only
DROP POLICY IF EXISTS "Anyone can insert page_views" ON public.page_views;
CREATE POLICY "Service role can insert page_views"
  ON public.page_views FOR INSERT TO service_role WITH CHECK (true);

-- UX analytics tables: service_role only
DROP POLICY IF EXISTS "Anyone can insert ux_accessibility_issues" ON public.ux_accessibility_issues;
CREATE POLICY "Service role can insert ux_accessibility_issues"
  ON public.ux_accessibility_issues FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can insert ux_click_heatmap" ON public.ux_click_heatmap;
CREATE POLICY "Service role can insert ux_click_heatmap"
  ON public.ux_click_heatmap FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can insert ux_client_errors" ON public.ux_client_errors;
CREATE POLICY "Service role can insert ux_client_errors"
  ON public.ux_client_errors FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can insert ux_feature_usage" ON public.ux_feature_usage;
CREATE POLICY "Service role can insert ux_feature_usage"
  ON public.ux_feature_usage FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can insert ux_navigation_events" ON public.ux_navigation_events;
CREATE POLICY "Service role can insert ux_navigation_events"
  ON public.ux_navigation_events FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can insert ux_performance_metrics" ON public.ux_performance_metrics;
CREATE POLICY "Service role can insert ux_performance_metrics"
  ON public.ux_performance_metrics FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can insert ux_rage_clicks" ON public.ux_rage_clicks;
CREATE POLICY "Service role can insert ux_rage_clicks"
  ON public.ux_rage_clicks FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can insert ux_search_events" ON public.ux_search_events;
CREATE POLICY "Service role can insert ux_search_events"
  ON public.ux_search_events FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can insert ux_user_feedback" ON public.ux_user_feedback;
CREATE POLICY "Service role can insert ux_user_feedback"
  ON public.ux_user_feedback FOR INSERT TO service_role WITH CHECK (true);

-- waitlist: add email validation
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist;
CREATE POLICY "Anyone can join waitlist"
  ON public.waitlist FOR INSERT TO anon, authenticated
  WITH CHECK (email IS NOT NULL AND length(email) <= 255 AND email ~ '^[^@]+@[^@]+\.[^@]+$');
