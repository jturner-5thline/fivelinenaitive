-- Page views tracking
CREATE TABLE public.page_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_path TEXT NOT NULL,
  page_title TEXT,
  user_id UUID,
  session_id TEXT NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  device_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Rage clicks
CREATE TABLE public.ux_rage_clicks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_path TEXT NOT NULL,
  element_selector TEXT,
  element_text TEXT,
  click_count INTEGER DEFAULT 1,
  session_id TEXT NOT NULL,
  device_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Feature usage
CREATE TABLE public.ux_feature_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  page_path TEXT,
  session_id TEXT NOT NULL,
  user_id UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Navigation events
CREATE TABLE public.ux_navigation_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  to_path TEXT NOT NULL,
  from_path TEXT,
  session_id TEXT NOT NULL,
  scroll_depth_percent INTEGER,
  time_on_previous_page_ms INTEGER,
  is_bounce BOOLEAN DEFAULT false,
  is_exit BOOLEAN DEFAULT false,
  device_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Performance metrics
CREATE TABLE public.ux_performance_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_path TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  value_ms NUMERIC,
  rating TEXT,
  device_type TEXT,
  session_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Client errors
CREATE TABLE public.ux_client_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_path TEXT NOT NULL,
  error_type TEXT NOT NULL,
  error_message TEXT,
  error_stack TEXT,
  component_name TEXT,
  session_id TEXT NOT NULL,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User feedback
CREATE TABLE public.ux_user_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_path TEXT NOT NULL,
  rating INTEGER,
  comment TEXT,
  category TEXT,
  session_id TEXT NOT NULL,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Search events
CREATE TABLE public.ux_search_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_path TEXT NOT NULL,
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  clicked_result_index INTEGER,
  filters_used JSONB,
  session_id TEXT NOT NULL,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Accessibility issues
CREATE TABLE public.ux_accessibility_issues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_path TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT,
  element_selector TEXT,
  wcag_criteria TEXT,
  is_resolved BOOLEAN DEFAULT false,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Click heatmap data
CREATE TABLE public.ux_click_heatmap (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  page_path TEXT NOT NULL,
  element_selector TEXT NOT NULL,
  element_text TEXT,
  click_count INTEGER DEFAULT 1,
  x_percent NUMERIC,
  y_percent NUMERIC,
  session_id TEXT NOT NULL,
  device_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ux_rage_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ux_feature_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ux_navigation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ux_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ux_client_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ux_user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ux_search_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ux_accessibility_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ux_click_heatmap ENABLE ROW LEVEL SECURITY;

-- Create policies for admin read access (admins can read all)
CREATE POLICY "Admins can read page_views" ON public.page_views FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND email IN (SELECT email FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'))
);

CREATE POLICY "Admins can read ux_rage_clicks" ON public.ux_rage_clicks FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND email IN (SELECT email FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'))
);

CREATE POLICY "Admins can read ux_feature_usage" ON public.ux_feature_usage FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND email IN (SELECT email FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'))
);

CREATE POLICY "Admins can read ux_navigation_events" ON public.ux_navigation_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND email IN (SELECT email FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'))
);

CREATE POLICY "Admins can read ux_performance_metrics" ON public.ux_performance_metrics FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND email IN (SELECT email FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'))
);

CREATE POLICY "Admins can read ux_client_errors" ON public.ux_client_errors FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND email IN (SELECT email FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'))
);

CREATE POLICY "Admins can read ux_user_feedback" ON public.ux_user_feedback FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND email IN (SELECT email FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'))
);

CREATE POLICY "Admins can read ux_search_events" ON public.ux_search_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND email IN (SELECT email FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'))
);

CREATE POLICY "Admins can read ux_accessibility_issues" ON public.ux_accessibility_issues FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND email IN (SELECT email FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'))
);

CREATE POLICY "Admins can read ux_click_heatmap" ON public.ux_click_heatmap FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND email IN (SELECT email FROM auth.users WHERE raw_user_meta_data->>'role' = 'admin'))
);

-- Allow anonymous inserts for tracking (these are analytics events)
CREATE POLICY "Anyone can insert page_views" ON public.page_views FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert ux_rage_clicks" ON public.ux_rage_clicks FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert ux_feature_usage" ON public.ux_feature_usage FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert ux_navigation_events" ON public.ux_navigation_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert ux_performance_metrics" ON public.ux_performance_metrics FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert ux_client_errors" ON public.ux_client_errors FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert ux_user_feedback" ON public.ux_user_feedback FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert ux_search_events" ON public.ux_search_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert ux_accessibility_issues" ON public.ux_accessibility_issues FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can insert ux_click_heatmap" ON public.ux_click_heatmap FOR INSERT WITH CHECK (true);

-- Create indexes for common queries
CREATE INDEX idx_page_views_page_path ON public.page_views(page_path);
CREATE INDEX idx_page_views_created_at ON public.page_views(created_at);
CREATE INDEX idx_page_views_device_type ON public.page_views(device_type);
CREATE INDEX idx_ux_rage_clicks_page_path ON public.ux_rage_clicks(page_path);
CREATE INDEX idx_ux_navigation_events_to_path ON public.ux_navigation_events(to_path);
CREATE INDEX idx_ux_performance_metrics_page_path ON public.ux_performance_metrics(page_path);
CREATE INDEX idx_ux_client_errors_page_path ON public.ux_client_errors(page_path);
CREATE INDEX idx_ux_click_heatmap_page_path ON public.ux_click_heatmap(page_path);