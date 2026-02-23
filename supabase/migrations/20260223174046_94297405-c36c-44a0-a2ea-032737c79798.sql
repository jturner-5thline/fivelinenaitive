
-- Add company_id to all UX analytics tables
ALTER TABLE public.page_views ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.ux_rage_clicks ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.ux_click_heatmap ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.ux_client_errors ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.ux_feature_usage ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.ux_navigation_events ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.ux_performance_metrics ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.ux_search_events ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.ux_user_feedback ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE public.ux_accessibility_issues ADD COLUMN IF NOT EXISTS company_id uuid;

-- Backfill company_id from user_id where possible
UPDATE public.page_views SET company_id = public.get_user_company_id(user_id) WHERE user_id IS NOT NULL AND company_id IS NULL;
UPDATE public.ux_client_errors SET company_id = public.get_user_company_id(user_id) WHERE user_id IS NOT NULL AND company_id IS NULL;
UPDATE public.ux_feature_usage SET company_id = public.get_user_company_id(user_id) WHERE user_id IS NOT NULL AND company_id IS NULL;
UPDATE public.ux_search_events SET company_id = public.get_user_company_id(user_id) WHERE user_id IS NOT NULL AND company_id IS NULL;
UPDATE public.ux_user_feedback SET company_id = public.get_user_company_id(user_id) WHERE user_id IS NOT NULL AND company_id IS NULL;
UPDATE public.ux_accessibility_issues SET company_id = public.get_user_company_id(user_id) WHERE user_id IS NOT NULL AND company_id IS NULL;

-- Add indexes for company_id
CREATE INDEX IF NOT EXISTS idx_page_views_company_id ON public.page_views(company_id);
CREATE INDEX IF NOT EXISTS idx_ux_rage_clicks_company_id ON public.ux_rage_clicks(company_id);
CREATE INDEX IF NOT EXISTS idx_ux_click_heatmap_company_id ON public.ux_click_heatmap(company_id);
CREATE INDEX IF NOT EXISTS idx_ux_client_errors_company_id ON public.ux_client_errors(company_id);
CREATE INDEX IF NOT EXISTS idx_ux_feature_usage_company_id ON public.ux_feature_usage(company_id);
CREATE INDEX IF NOT EXISTS idx_ux_navigation_events_company_id ON public.ux_navigation_events(company_id);
CREATE INDEX IF NOT EXISTS idx_ux_performance_metrics_company_id ON public.ux_performance_metrics(company_id);
CREATE INDEX IF NOT EXISTS idx_ux_search_events_company_id ON public.ux_search_events(company_id);
CREATE INDEX IF NOT EXISTS idx_ux_user_feedback_company_id ON public.ux_user_feedback(company_id);
CREATE INDEX IF NOT EXISTS idx_ux_accessibility_issues_company_id ON public.ux_accessibility_issues(company_id);

-- Drop old admin-only SELECT policies and replace with company-scoped ones

-- page_views
DROP POLICY IF EXISTS "Admins can read page_views" ON public.page_views;
CREATE POLICY "Admins can read own company page_views" ON public.page_views FOR SELECT
USING (public.is_admin(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()));

-- ux_rage_clicks
DROP POLICY IF EXISTS "Admins can read ux_rage_clicks" ON public.ux_rage_clicks;
CREATE POLICY "Admins can read own company ux_rage_clicks" ON public.ux_rage_clicks FOR SELECT
USING (public.is_admin(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()));

-- ux_click_heatmap
DROP POLICY IF EXISTS "Admins can read ux_click_heatmap" ON public.ux_click_heatmap;
CREATE POLICY "Admins can read own company ux_click_heatmap" ON public.ux_click_heatmap FOR SELECT
USING (public.is_admin(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()));

-- ux_client_errors
DROP POLICY IF EXISTS "Admins can read ux_client_errors" ON public.ux_client_errors;
CREATE POLICY "Admins can read own company ux_client_errors" ON public.ux_client_errors FOR SELECT
USING (public.is_admin(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()));

-- ux_feature_usage
DROP POLICY IF EXISTS "Admins can read ux_feature_usage" ON public.ux_feature_usage;
CREATE POLICY "Admins can read own company ux_feature_usage" ON public.ux_feature_usage FOR SELECT
USING (public.is_admin(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()));

-- ux_navigation_events
DROP POLICY IF EXISTS "Admins can read ux_navigation_events" ON public.ux_navigation_events;
CREATE POLICY "Admins can read own company ux_navigation_events" ON public.ux_navigation_events FOR SELECT
USING (public.is_admin(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()));

-- ux_performance_metrics
DROP POLICY IF EXISTS "Admins can read ux_performance_metrics" ON public.ux_performance_metrics;
CREATE POLICY "Admins can read own company ux_performance_metrics" ON public.ux_performance_metrics FOR SELECT
USING (public.is_admin(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()));

-- ux_search_events
DROP POLICY IF EXISTS "Admins can read ux_search_events" ON public.ux_search_events;
CREATE POLICY "Admins can read own company ux_search_events" ON public.ux_search_events FOR SELECT
USING (public.is_admin(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()));

-- ux_user_feedback
DROP POLICY IF EXISTS "Admins can read ux_user_feedback" ON public.ux_user_feedback;
CREATE POLICY "Admins can read own company ux_user_feedback" ON public.ux_user_feedback FOR SELECT
USING (public.is_admin(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()));

-- ux_accessibility_issues
DROP POLICY IF EXISTS "Admins can read ux_accessibility_issues" ON public.ux_accessibility_issues;
CREATE POLICY "Admins can read own company ux_accessibility_issues" ON public.ux_accessibility_issues FOR SELECT
USING (public.is_admin(auth.uid()) AND company_id = public.get_user_company_id(auth.uid()));
