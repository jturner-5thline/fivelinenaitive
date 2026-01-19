import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Types for UX Analytics
export interface PageViewStats {
  page_path: string;
  view_count: number;
  unique_sessions: number;
  avg_time_on_page: number;
}

export interface RageClickData {
  page_path: string;
  element_selector: string;
  element_text: string;
  click_count: number;
  device_type: string;
}

export interface PerformanceMetric {
  metric_type: string;
  avg_value: number;
  rating: string;
  device_type: string;
}

export interface NavigationEvent {
  to_path: string;
  from_path: string | null;
  scroll_depth_percent: number | null;
  time_on_previous_page_ms: number | null;
  is_bounce: boolean | null;
  is_exit: boolean | null;
  device_type: string | null;
}

export interface ClientError {
  page_path: string;
  error_type: string;
  error_message: string | null;
  occurrence_count: number;
  component_name: string | null;
}

export interface UserFeedback {
  page_path: string;
  rating: number | null;
  comment: string | null;
  category: string | null;
}

export interface SearchEvent {
  query: string;
  results_count: number;
  click_rate: number;
  search_count: number;
}

export interface AccessibilityIssue {
  page_path: string;
  issue_type: string;
  severity: string;
  description: string;
  wcag_criteria: string;
  is_resolved: boolean;
}

export interface ClickHeatmapData {
  page_path: string;
  element_selector: string;
  element_text: string;
  click_count: number;
  x_percent: number;
  y_percent: number;
}

export interface DeviceMetrics {
  device_type: string;
  session_count: number;
  avg_page_views: number;
  avg_time_on_site: number;
  error_rate: number;
  bounce_rate: number;
  lcp_avg: number;
  fid_avg: number;
  cls_avg: number;
}

export interface FunnelStep {
  name: string;
  count: number;
  conversion_rate: number;
}

export interface UXInsight {
  id: string;
  title: string;
  description: string;
  metric_value: string;
  trend: "up" | "down" | "neutral";
  category: "positive" | "negative" | "neutral";
  details: string;
  recommendations: string[];
  prompt: string;
}

export interface UXRecommendation {
  id: string;
  title: string;
  description: string;
  reasoning: string;
  priority: "critical" | "high" | "medium" | "low";
  category: "engagement" | "conversion" | "usability" | "bugs" | "design" | "retention";
  current_value: number;
  target_value: number;
  action_items: string[];
  impact: string;
  prompt: string;
}

// Hook for page views
export function usePageViews() {
  return useQuery({
    queryKey: ["ux-page-views"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_views")
        .select("page_path, session_id, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;

      // Aggregate by page path
      const pageStats = new Map<string, { views: number; sessions: Set<string> }>();
      data?.forEach((row) => {
        const existing = pageStats.get(row.page_path) || { views: 0, sessions: new Set() };
        existing.views++;
        existing.sessions.add(row.session_id);
        pageStats.set(row.page_path, existing);
      });

      return Array.from(pageStats.entries()).map(([path, stats]) => ({
        page_path: path,
        view_count: stats.views,
        unique_sessions: stats.sessions.size,
      }));
    },
  });
}

// Hook for rage clicks
export function useRageClicks() {
  return useQuery({
    queryKey: ["ux-rage-clicks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ux_rage_clicks")
        .select("*")
        .order("click_count", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as RageClickData[];
    },
  });
}

// Hook for performance metrics
export function usePerformanceMetrics() {
  return useQuery({
    queryKey: ["ux-performance-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ux_performance_metrics")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      // Aggregate by metric type and device
      const metrics = new Map<string, { total: number; count: number; device: string }>();
      data?.forEach((row) => {
        const key = `${row.metric_type}-${row.device_type}`;
        const existing = metrics.get(key) || { total: 0, count: 0, device: row.device_type || "unknown" };
        existing.total += Number(row.value_ms) || 0;
        existing.count++;
        metrics.set(key, existing);
      });

      return Array.from(metrics.entries()).map(([key, stats]) => ({
        metric_type: key.split("-")[0],
        device_type: stats.device,
        avg_value: stats.total / stats.count,
        rating: stats.total / stats.count < 2500 ? "good" : stats.total / stats.count < 4000 ? "needs-improvement" : "poor",
      }));
    },
  });
}

// Hook for navigation events
export function useNavigationEvents() {
  return useQuery({
    queryKey: ["ux-navigation-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ux_navigation_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      return data;
    },
  });
}

// Hook for client errors
export function useClientErrors() {
  return useQuery({
    queryKey: ["ux-client-errors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ux_client_errors")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      // Aggregate errors by type and message
      const errorMap = new Map<string, { count: number; data: typeof data[0] }>();
      data?.forEach((row) => {
        const key = `${row.error_type}-${row.error_message?.substring(0, 50)}`;
        const existing = errorMap.get(key) || { count: 0, data: row };
        existing.count++;
        errorMap.set(key, existing);
      });

      return Array.from(errorMap.values()).map((item) => ({
        ...item.data,
        occurrence_count: item.count,
      }));
    },
  });
}

// Hook for user feedback
export function useUserFeedback() {
  return useQuery({
    queryKey: ["ux-user-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ux_user_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      return data;
    },
  });
}

// Hook for search events
export function useSearchEvents() {
  return useQuery({
    queryKey: ["ux-search-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ux_search_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      // Aggregate failed searches
      const failed = data?.filter((s) => s.results_count === 0) || [];
      return {
        total: data?.length || 0,
        failed: failed.length,
        failedQueries: failed.slice(0, 10),
      };
    },
  });
}

// Hook for accessibility issues
export function useAccessibilityIssues() {
  return useQuery({
    queryKey: ["ux-accessibility-issues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ux_accessibility_issues")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as AccessibilityIssue[];
    },
  });
}

// Hook for click heatmap data
export function useClickHeatmap(pagePath?: string) {
  return useQuery({
    queryKey: ["ux-click-heatmap", pagePath],
    queryFn: async () => {
      let query = supabase
        .from("ux_click_heatmap")
        .select("*")
        .order("click_count", { ascending: false });

      if (pagePath) {
        query = query.eq("page_path", pagePath);
      }

      const { data, error } = await query.limit(200);

      if (error) throw error;
      return data as ClickHeatmapData[];
    },
  });
}

// Hook for device metrics
export function useDeviceMetrics() {
  return useQuery({
    queryKey: ["ux-device-metrics"],
    queryFn: async () => {
      // Get page views by device
      const { data: pageViews, error: pvError } = await supabase
        .from("page_views")
        .select("device_type, session_id")
        .limit(1000);

      if (pvError) throw pvError;

      // Get performance by device
      const { data: performance, error: perfError } = await supabase
        .from("ux_performance_metrics")
        .select("device_type, metric_type, value_ms")
        .limit(500);

      if (perfError) throw perfError;

      // Get errors by device
      const { data: errors, error: errError } = await supabase
        .from("ux_client_errors")
        .select("page_path, session_id")
        .limit(200);

      if (errError) throw errError;

      // Get navigation for bounce rate
      const { data: navigation, error: navError } = await supabase
        .from("ux_navigation_events")
        .select("device_type, is_bounce, session_id")
        .limit(500);

      if (navError) throw navError;

      // Aggregate by device type
      const devices = ["desktop", "mobile", "tablet"];
      const deviceMetrics: DeviceMetrics[] = devices.map((device) => {
        const deviceViews = pageViews?.filter((p) => p.device_type === device) || [];
        const devicePerf = performance?.filter((p) => p.device_type === device) || [];
        const deviceNav = navigation?.filter((n) => n.device_type === device) || [];
        const sessions = new Set(deviceViews.map((v) => v.session_id));

        const lcp = devicePerf.filter((p) => p.metric_type === "LCP");
        const fid = devicePerf.filter((p) => p.metric_type === "FID");
        const cls = devicePerf.filter((p) => p.metric_type === "CLS");

        const bounces = deviceNav.filter((n) => n.is_bounce).length;

        return {
          device_type: device,
          session_count: sessions.size,
          avg_page_views: sessions.size > 0 ? deviceViews.length / sessions.size : 0,
          avg_time_on_site: 0, // Would need more data
          error_rate: sessions.size > 0 ? (errors?.length || 0) / sessions.size * 100 : 0,
          bounce_rate: deviceNav.length > 0 ? (bounces / deviceNav.length) * 100 : 0,
          lcp_avg: lcp.length > 0 ? lcp.reduce((sum, p) => sum + Number(p.value_ms), 0) / lcp.length : 0,
          fid_avg: fid.length > 0 ? fid.reduce((sum, p) => sum + Number(p.value_ms), 0) / fid.length : 0,
          cls_avg: cls.length > 0 ? cls.reduce((sum, p) => sum + Number(p.value_ms), 0) / cls.length : 0,
        };
      });

      return deviceMetrics;
    },
  });
}

// Main hook for UX recommendations
export function useUXRecommendations() {
  const { data: pageViews } = usePageViews();
  const { data: rageClicks } = useRageClicks();
  const { data: performance } = usePerformanceMetrics();
  const { data: navigation } = useNavigationEvents();
  const { data: errors } = useClientErrors();
  const { data: feedback } = useUserFeedback();
  const { data: searchData } = useSearchEvents();
  const { data: accessibility } = useAccessibilityIssues();
  const { data: devices } = useDeviceMetrics();

  // Generate health score
  const healthScore = calculateHealthScore({
    rageClicks: rageClicks?.length || 0,
    errors: errors?.length || 0,
    avgRating: feedback?.reduce((sum, f) => sum + (f.rating || 0), 0) / (feedback?.length || 1) || 0,
    accessibilityIssues: accessibility?.filter((a) => !a.is_resolved).length || 0,
  });

  // Generate insights
  const insights: UXInsight[] = generateInsights({
    pageViews: pageViews || [],
    rageClicks: rageClicks || [],
    errors: errors || [],
    navigation: navigation || [],
    feedback: feedback || [],
    searchData,
  });

  // Generate recommendations
  const recommendations: UXRecommendation[] = generateRecommendations({
    rageClicks: rageClicks || [],
    errors: errors || [],
    performance: performance || [],
    navigation: navigation || [],
    accessibility: accessibility || [],
    searchData,
    devices: devices || [],
  });

  // Generate funnels
  const userEngagementFunnel = generateUserEngagementFunnel(pageViews || [], navigation || []);
  const dealEngagementFunnel = generateDealEngagementFunnel(pageViews || []);

  return {
    healthScore,
    insights,
    recommendations,
    userEngagementFunnel,
    dealEngagementFunnel,
    isLoading: false,
    totalRecommendations: recommendations.length,
  };
}

function calculateHealthScore(data: {
  rageClicks: number;
  errors: number;
  avgRating: number;
  accessibilityIssues: number;
}): number {
  let score = 100;

  // Deduct for rage clicks
  score -= Math.min(data.rageClicks * 2, 20);

  // Deduct for errors
  score -= Math.min(data.errors * 3, 25);

  // Deduct for low ratings
  if (data.avgRating < 3) score -= 15;
  else if (data.avgRating < 4) score -= 5;

  // Deduct for accessibility issues
  score -= Math.min(data.accessibilityIssues * 5, 20);

  return Math.max(0, Math.min(100, Math.round(score)));
}

function generateInsights(data: {
  pageViews: { page_path: string; view_count: number }[];
  rageClicks: RageClickData[];
  errors: ClientError[];
  navigation: NavigationEvent[];
  feedback: UserFeedback[];
  searchData: { total: number; failed: number; failedQueries: any[] } | undefined;
}): UXInsight[] {
  const insights: UXInsight[] = [];

  // Top page insight
  if (data.pageViews.length > 0) {
    const topPage = data.pageViews.sort((a, b) => b.view_count - a.view_count)[0];
    insights.push({
      id: "top-page",
      title: "Most Visited Page",
      description: `${topPage.page_path} is your most popular page`,
      metric_value: `${topPage.view_count} views`,
      trend: "up",
      category: "positive",
      details: "This page drives the most traffic. Consider optimizing it further.",
      recommendations: ["Add clear CTAs", "Optimize load time", "A/B test headlines"],
      prompt: `Optimize the ${topPage.page_path} page for better conversions. Add clear call-to-action buttons, improve the headline, and ensure fast load times.`,
    });
  }

  // Rage click insight
  if (data.rageClicks.length > 0) {
    const topRage = data.rageClicks[0];
    insights.push({
      id: "rage-clicks",
      title: "Frustration Detected",
      description: `${data.rageClicks.length} rage click hotspots found`,
      metric_value: `${topRage.click_count} clicks`,
      trend: "down",
      category: "negative",
      details: `Users are repeatedly clicking on "${topRage.element_text || topRage.element_selector}" which may indicate a broken or confusing element.`,
      recommendations: ["Check if element is clickable", "Add visual feedback", "Improve affordance"],
      prompt: `Fix the frustration point on ${topRage.page_path}. The element "${topRage.element_text || topRage.element_selector}" is causing rage clicks. Make it more responsive or add clear visual feedback.`,
    });
  }

  // Error insight
  if (data.errors.length > 0) {
    insights.push({
      id: "errors",
      title: "Client Errors",
      description: `${data.errors.length} unique error types detected`,
      metric_value: `${data.errors.reduce((sum, e) => sum + e.occurrence_count, 0)} total`,
      trend: "down",
      category: "negative",
      details: "Errors are degrading user experience and may cause drop-offs.",
      recommendations: ["Fix critical errors first", "Add error boundaries", "Improve error messages"],
      prompt: `Fix the client-side errors in the application. The most common error is "${data.errors[0].error_message}". Add proper error handling and user-friendly error messages.`,
    });
  }

  // Search insight
  if (data.searchData && data.searchData.failed > 0) {
    insights.push({
      id: "failed-searches",
      title: "Search Gaps",
      description: `${data.searchData.failed} searches returned no results`,
      metric_value: `${((data.searchData.failed / data.searchData.total) * 100).toFixed(1)}% fail rate`,
      trend: "down",
      category: "negative",
      details: "Users are searching for content that doesn't exist or isn't findable.",
      recommendations: ["Add missing content", "Improve search algorithm", "Add synonyms"],
      prompt: `Improve the search functionality. Users are searching for terms that return no results. Consider adding fuzzy matching, synonyms, or the missing content they're looking for.`,
    });
  }

  return insights;
}

function generateRecommendations(data: {
  rageClicks: RageClickData[];
  errors: ClientError[];
  performance: PerformanceMetric[];
  navigation: NavigationEvent[];
  accessibility: AccessibilityIssue[];
  searchData: { total: number; failed: number; failedQueries: any[] } | undefined;
  devices: DeviceMetrics[];
}): UXRecommendation[] {
  const recommendations: UXRecommendation[] = [];

  // Performance recommendations
  const slowMetrics = data.performance.filter((p) => p.rating === "poor");
  if (slowMetrics.length > 0) {
    recommendations.push({
      id: "perf-1",
      title: "Improve Page Load Speed",
      description: "Several pages have poor Core Web Vitals scores",
      reasoning: "Slow pages lead to higher bounce rates and lower conversions.",
      priority: "high",
      category: "usability",
      current_value: slowMetrics[0].avg_value,
      target_value: 2500,
      action_items: [
        "Optimize images and use modern formats (WebP)",
        "Implement lazy loading for below-fold content",
        "Minimize JavaScript bundle size",
        "Use CDN for static assets",
      ],
      impact: "Could improve bounce rate by 20-30%",
      prompt: `Optimize page load performance. Current LCP is ${slowMetrics[0].avg_value}ms. Implement lazy loading, optimize images to WebP format, and split the JavaScript bundle for faster initial load.`,
    });
  }

  // Rage click recommendations
  if (data.rageClicks.length > 3) {
    recommendations.push({
      id: "rage-1",
      title: "Fix Frustration Points",
      description: `${data.rageClicks.length} elements are causing user frustration`,
      reasoning: "Rage clicks indicate broken interactions or confusing UI elements.",
      priority: "critical",
      category: "bugs",
      current_value: data.rageClicks.length,
      target_value: 0,
      action_items: [
        "Review each rage click hotspot",
        "Ensure clickable elements have proper cursor styles",
        "Add loading states to buttons",
        "Improve visual feedback on interactions",
      ],
      impact: "Reduce user frustration and improve task completion",
      prompt: `Fix rage click frustration points. The top offending elements are: ${data.rageClicks.slice(0, 3).map(r => r.element_text || r.element_selector).join(", ")}. Ensure these elements provide clear visual feedback and work correctly.`,
    });
  }

  // Error recommendations
  if (data.errors.length > 0) {
    recommendations.push({
      id: "errors-1",
      title: "Resolve Client-Side Errors",
      description: `${data.errors.length} error types affecting users`,
      reasoning: "Errors disrupt user flows and erode trust in the application.",
      priority: "critical",
      category: "bugs",
      current_value: data.errors.reduce((sum, e) => sum + e.occurrence_count, 0),
      target_value: 0,
      action_items: [
        "Prioritize errors by occurrence count",
        "Add error boundaries to prevent cascading failures",
        "Implement proper error logging",
        "Show user-friendly error messages",
      ],
      impact: "Improve reliability and user trust",
      prompt: `Fix client-side errors. Most common error: "${data.errors[0].error_message}" on ${data.errors[0].page_path}. Add proper error handling and user-friendly fallback UI.`,
    });
  }

  // Accessibility recommendations
  const unresolvedA11y = data.accessibility.filter((a) => !a.is_resolved);
  if (unresolvedA11y.length > 0) {
    const critical = unresolvedA11y.filter((a) => a.severity === "critical");
    recommendations.push({
      id: "a11y-1",
      title: "Address Accessibility Issues",
      description: `${unresolvedA11y.length} accessibility issues need attention`,
      reasoning: "Accessibility issues exclude users and may have legal implications.",
      priority: critical.length > 0 ? "critical" : "high",
      category: "usability",
      current_value: unresolvedA11y.length,
      target_value: 0,
      action_items: [
        "Fix critical WCAG violations first",
        "Add proper ARIA labels",
        "Ensure keyboard navigation works",
        "Test with screen readers",
      ],
      impact: "Improve access for all users and meet compliance standards",
      prompt: `Fix accessibility issues. ${critical.length > 0 ? `Critical issue: ${critical[0].description}` : `First issue: ${unresolvedA11y[0].description}`}. Ensure WCAG 2.1 AA compliance.`,
    });
  }

  // Mobile optimization
  const mobileDevice = data.devices.find((d) => d.device_type === "mobile");
  const desktopDevice = data.devices.find((d) => d.device_type === "desktop");
  if (mobileDevice && desktopDevice && mobileDevice.bounce_rate > desktopDevice.bounce_rate + 10) {
    recommendations.push({
      id: "mobile-1",
      title: "Optimize Mobile Experience",
      description: "Mobile users have significantly higher bounce rates",
      reasoning: `Mobile bounce rate is ${mobileDevice.bounce_rate.toFixed(1)}% vs desktop ${desktopDevice.bounce_rate.toFixed(1)}%`,
      priority: "high",
      category: "engagement",
      current_value: mobileDevice.bounce_rate,
      target_value: desktopDevice.bounce_rate,
      action_items: [
        "Review mobile layout and spacing",
        "Optimize touch targets (min 44px)",
        "Reduce mobile-specific load time",
        "Test on various device sizes",
      ],
      impact: `Could recover ${((mobileDevice.bounce_rate - desktopDevice.bounce_rate) * mobileDevice.session_count / 100).toFixed(0)} potentially lost sessions`,
      prompt: `Improve mobile user experience. Mobile bounce rate is ${mobileDevice.bounce_rate.toFixed(1)}% higher than desktop. Optimize touch targets, improve mobile layouts, and reduce load time on mobile devices.`,
    });
  }

  return recommendations;
}

function generateUserEngagementFunnel(
  pageViews: { page_path: string; view_count: number; unique_sessions?: number }[],
  navigation: NavigationEvent[]
): FunnelStep[] {
  const totalSessions = pageViews.reduce((sum, p) => sum + (p.unique_sessions || 1), 0);
  const dealPageViews = pageViews.filter((p) => p.page_path.includes("/deal")).reduce((sum, p) => sum + p.view_count, 0);

  return [
    { name: "Total Users", count: totalSessions, conversion_rate: 100 },
    { name: "Active Users", count: Math.round(totalSessions * 0.7), conversion_rate: 70 },
    { name: "Viewed Deals", count: Math.round(dealPageViews * 0.5), conversion_rate: 50 },
    { name: "Engaged with Deal", count: Math.round(dealPageViews * 0.2), conversion_rate: 20 },
  ];
}

function generateDealEngagementFunnel(
  pageViews: { page_path: string; view_count: number }[]
): FunnelStep[] {
  const dealViews = pageViews.filter((p) => p.page_path.includes("/deal")).reduce((sum, p) => sum + p.view_count, 0) || 100;

  return [
    { name: "Page Views", count: dealViews, conversion_rate: 100 },
    { name: "Detail Views", count: Math.round(dealViews * 0.6), conversion_rate: 60 },
    { name: "Follows", count: Math.round(dealViews * 0.3), conversion_rate: 30 },
    { name: "Info Requests", count: Math.round(dealViews * 0.1), conversion_rate: 10 },
    { name: "Data Room Views", count: Math.round(dealViews * 0.05), conversion_rate: 5 },
  ];
}
