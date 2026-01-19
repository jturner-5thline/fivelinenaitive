import { UXInsight, UXRecommendation, ClickHeatmapData } from "@/hooks/useUXAnalytics";

export interface InsightRecommendation {
  title: string;
  description: string;
  actionItems: string[];
  lovablePrompt: string;
}

export interface HeatmapInsight {
  id: string;
  type: "rage_clicks" | "low_scroll" | "click_concentration" | "dead_zones";
  title: string;
  description: string;
  page_path: string;
  severity: "critical" | "high" | "medium" | "low";
  metrics: {
    current: number;
    threshold: number;
  };
}

// Get recommendations for a specific insight
export function getInsightRecommendations(insight: UXInsight): InsightRecommendation[] {
  const recommendations: InsightRecommendation[] = [];

  switch (insight.id) {
    case "top-page":
      recommendations.push({
        title: "Optimize High-Traffic Page",
        description: "This page drives the most traffic - optimize it for conversions",
        actionItems: [
          "Add clear call-to-action buttons above the fold",
          "Implement A/B testing for headlines",
          "Optimize images and reduce load time",
          "Add social proof elements",
        ],
        lovablePrompt: `Optimize the ${insight.description.split(" ")[0]} page for better conversions. Add a prominent call-to-action button above the fold, improve the headline to be more compelling, add social proof elements like testimonials or trust badges, and ensure the page loads quickly by lazy-loading images.`,
      });
      break;

    case "rage-clicks":
      recommendations.push({
        title: "Fix Frustration Points",
        description: "Users are rage-clicking on elements that don't respond as expected",
        actionItems: [
          "Check if clicked elements are actually interactive",
          "Add loading states to buttons",
          "Improve visual feedback on interactions",
          "Ensure touch targets are at least 44px",
        ],
        lovablePrompt: `Fix the rage click frustration points in the application. Review elements that users are clicking repeatedly without response. Add proper hover and active states to all interactive elements, implement loading spinners for async operations, and ensure all buttons have cursor:pointer and clear visual feedback.`,
      });
      break;

    case "errors":
      recommendations.push({
        title: "Implement Error Handling",
        description: "Client-side errors are degrading user experience",
        actionItems: [
          "Add React Error Boundaries around key components",
          "Implement try-catch for async operations",
          "Show user-friendly error messages",
          "Add error logging and monitoring",
        ],
        lovablePrompt: `Implement comprehensive error handling. Add Error Boundaries to wrap major sections of the app, implement try-catch blocks for all async operations, show user-friendly error messages with recovery options instead of crashing, and ensure errors are logged to the console with stack traces for debugging.`,
      });
      break;

    case "failed-searches":
      recommendations.push({
        title: "Improve Search Experience",
        description: "Users are searching for content that returns no results",
        actionItems: [
          "Implement fuzzy matching in search",
          "Add search suggestions/autocomplete",
          "Show helpful messages when no results found",
          "Track and add missing content users search for",
        ],
        lovablePrompt: `Improve the search functionality to reduce failed searches. Implement fuzzy matching to handle typos, add autocomplete suggestions as users type, show a helpful "No results" message with alternative suggestions, and consider what content users are searching for that doesn't exist.`,
      });
      break;

    default:
      recommendations.push({
        title: "Review and Optimize",
        description: insight.description,
        actionItems: insight.recommendations,
        lovablePrompt: insight.prompt,
      });
  }

  return recommendations;
}

// Convert an insight into a full UXRecommendation
export function convertInsightToRecommendation(insight: UXInsight): UXRecommendation {
  const priorityMap: Record<string, UXRecommendation["priority"]> = {
    "rage-clicks": "critical",
    errors: "critical",
    "failed-searches": "high",
    "top-page": "medium",
  };

  const categoryMap: Record<string, UXRecommendation["category"]> = {
    "rage-clicks": "bugs",
    errors: "bugs",
    "failed-searches": "usability",
    "top-page": "conversion",
  };

  const recs = getInsightRecommendations(insight);
  const firstRec = recs[0];

  return {
    id: `insight-${insight.id}`,
    title: firstRec?.title || insight.title,
    description: firstRec?.description || insight.description,
    reasoning: insight.details,
    priority: priorityMap[insight.id] || "medium",
    category: categoryMap[insight.id] || "usability",
    current_value: parseFloat(insight.metric_value.replace(/[^0-9.]/g, "")) || 0,
    target_value: 0,
    action_items: firstRec?.actionItems || insight.recommendations,
    impact: "Improve user experience and engagement",
    prompt: firstRec?.lovablePrompt || insight.prompt,
  };
}

// Generate insights from heatmap data
export function generateHeatmapInsights(
  heatmaps: ClickHeatmapData[],
  engagement: { page_path: string; scroll_depth: number; time_on_page: number }[]
): HeatmapInsight[] {
  const insights: HeatmapInsight[] = [];

  // Group heatmaps by page
  const pageClicks = new Map<string, ClickHeatmapData[]>();
  heatmaps.forEach((h) => {
    const existing = pageClicks.get(h.page_path) || [];
    existing.push(h);
    pageClicks.set(h.page_path, existing);
  });

  // Analyze each page
  pageClicks.forEach((clicks, pagePath) => {
    const totalClicks = clicks.reduce((sum, c) => sum + c.click_count, 0);
    const topElement = clicks[0];

    // Check for click concentration (one element gets >50% of clicks)
    if (topElement && topElement.click_count / totalClicks > 0.5) {
      insights.push({
        id: `concentration-${pagePath}`,
        type: "click_concentration",
        title: "Click Concentration Detected",
        description: `On ${pagePath}, ${((topElement.click_count / totalClicks) * 100).toFixed(0)}% of clicks go to a single element`,
        page_path: pagePath,
        severity: "medium",
        metrics: {
          current: (topElement.click_count / totalClicks) * 100,
          threshold: 50,
        },
      });
    }

    // Check for dead zones (page has very few clicks)
    if (totalClicks < 10 && clicks.length < 3) {
      insights.push({
        id: `dead-zone-${pagePath}`,
        type: "dead_zones",
        title: "Low Engagement Page",
        description: `${pagePath} has very few clicks, indicating low engagement`,
        page_path: pagePath,
        severity: "low",
        metrics: {
          current: totalClicks,
          threshold: 10,
        },
      });
    }
  });

  // Analyze scroll depth
  engagement.forEach((e) => {
    if (e.scroll_depth < 30) {
      insights.push({
        id: `scroll-${e.page_path}`,
        type: "low_scroll",
        title: "Low Scroll Depth",
        description: `Users only scroll ${e.scroll_depth}% on ${e.page_path}`,
        page_path: e.page_path,
        severity: e.scroll_depth < 15 ? "high" : "medium",
        metrics: {
          current: e.scroll_depth,
          threshold: 50,
        },
      });
    }
  });

  return insights;
}

// Convert heatmap insight to recommendation
export function convertHeatmapInsightToRecommendation(insight: HeatmapInsight): UXRecommendation {
  const prompts: Record<HeatmapInsight["type"], string> = {
    rage_clicks: `Fix rage clicks on ${insight.page_path}. Users are repeatedly clicking on unresponsive elements. Add proper click handlers, loading states, and visual feedback to interactive elements.`,
    low_scroll: `Improve below-fold content visibility on ${insight.page_path}. Currently users only scroll ${insight.metrics.current}%. Add visual cues to encourage scrolling, place important content higher, or add scroll-triggered animations.`,
    click_concentration: `Distribute user attention on ${insight.page_path}. Currently ${insight.metrics.current.toFixed(0)}% of clicks go to one element. Add more prominent secondary CTAs and improve visual hierarchy.`,
    dead_zones: `Increase engagement on ${insight.page_path}. This page has very low interaction. Add more interactive elements, improve the content, or reconsider if this page is necessary.`,
  };

  const titles: Record<HeatmapInsight["type"], string> = {
    rage_clicks: "Fix Frustration Points",
    low_scroll: "Improve Below-Fold Visibility",
    click_concentration: "Distribute User Attention",
    dead_zones: "Increase Page Engagement",
  };

  const actionItems: Record<HeatmapInsight["type"], string[]> = {
    rage_clicks: [
      "Audit non-responsive elements users click on",
      "Add loading indicators to async actions",
      "Ensure all clickable elements have proper cursors",
      "Add hover/active states for feedback",
    ],
    low_scroll: [
      "Add scroll indicators or animated arrows",
      "Move important content above the fold",
      "Add scroll-triggered animations",
      "Create compelling above-fold content",
    ],
    click_concentration: [
      "Add secondary call-to-action buttons",
      "Improve visual hierarchy with better contrast",
      "Use whitespace to highlight other elements",
      "Add hover effects to draw attention",
    ],
    dead_zones: [
      "Add interactive elements like buttons or links",
      "Improve content quality and relevance",
      "Consider consolidating with other pages",
      "Add engaging visuals or media",
    ],
  };

  return {
    id: insight.id,
    title: titles[insight.type],
    description: insight.description,
    reasoning: `Detected ${insight.type.replace("_", " ")} pattern on ${insight.page_path}`,
    priority: insight.severity,
    category: insight.type === "rage_clicks" ? "bugs" : "engagement",
    current_value: insight.metrics.current,
    target_value: insight.metrics.threshold,
    action_items: actionItems[insight.type],
    impact: "Improve page engagement and user satisfaction",
    prompt: prompts[insight.type],
  };
}

// Generate device-specific recommendations
export function generateDeviceRecommendations(
  deviceMetrics: {
    device_type: string;
    session_count: number;
    avg_page_views: number;
    bounce_rate: number;
    error_rate: number;
    lcp_avg: number;
    fid_avg: number;
    cls_avg: number;
  }[]
): UXRecommendation[] {
  const recommendations: UXRecommendation[] = [];
  const mobile = deviceMetrics.find((d) => d.device_type === "mobile");
  const desktop = deviceMetrics.find((d) => d.device_type === "desktop");
  const tablet = deviceMetrics.find((d) => d.device_type === "tablet");

  // Mobile-specific issues
  if (mobile) {
    if (mobile.lcp_avg > 3000) {
      recommendations.push({
        id: "mobile-lcp",
        title: "Improve Mobile Load Speed",
        description: `Mobile LCP is ${(mobile.lcp_avg / 1000).toFixed(1)}s (should be <2.5s)`,
        reasoning: "Slow mobile load times cause high bounce rates and poor user experience",
        priority: mobile.lcp_avg > 4000 ? "critical" : "high",
        category: "usability",
        current_value: mobile.lcp_avg,
        target_value: 2500,
        action_items: [
          "Optimize and compress images for mobile",
          "Implement lazy loading for below-fold content",
          "Use responsive images with srcset",
          "Minimize CSS and JavaScript bundle size",
        ],
        impact: "Could reduce mobile bounce rate by 15-25%",
        prompt: `Optimize mobile page load speed. Current LCP is ${(mobile.lcp_avg / 1000).toFixed(1)} seconds. Implement lazy loading for images below the fold, use next-gen image formats (WebP), add loading="lazy" to images, and reduce JavaScript bundle size with code splitting.`,
      });
    }

    if (mobile.fid_avg > 200) {
      recommendations.push({
        id: "mobile-fid",
        title: "Improve Mobile Interactivity",
        description: `Mobile FID is ${mobile.fid_avg.toFixed(0)}ms (should be <100ms)`,
        reasoning: "Slow response to taps frustrates mobile users",
        priority: mobile.fid_avg > 300 ? "critical" : "high",
        category: "usability",
        current_value: mobile.fid_avg,
        target_value: 100,
        action_items: [
          "Minimize main thread blocking JavaScript",
          "Break up long tasks",
          "Use requestIdleCallback for non-critical work",
          "Defer third-party scripts",
        ],
        impact: "Improve perceived responsiveness on mobile",
        prompt: `Improve mobile interactivity. Current FID is ${mobile.fid_avg.toFixed(0)}ms. Break up long JavaScript tasks, defer non-critical scripts, and use requestIdleCallback for background work. Add touch feedback with active states.`,
      });
    }

    if (desktop && mobile.bounce_rate > desktop.bounce_rate + 15) {
      recommendations.push({
        id: "mobile-bounce",
        title: "Reduce Mobile Bounce Rate",
        description: `Mobile bounce rate is ${mobile.bounce_rate.toFixed(1)}% vs desktop ${desktop.bounce_rate.toFixed(1)}%`,
        reasoning: "Mobile users are leaving at a significantly higher rate than desktop users",
        priority: "high",
        category: "engagement",
        current_value: mobile.bounce_rate,
        target_value: desktop.bounce_rate,
        action_items: [
          "Review mobile layout and spacing",
          "Ensure touch targets are at least 44px",
          "Simplify mobile navigation",
          "Test on various mobile devices",
        ],
        impact: `Could recover ${Math.round((mobile.bounce_rate - desktop.bounce_rate) * mobile.session_count / 100)} sessions`,
        prompt: `Reduce mobile bounce rate. Mobile users bounce ${(mobile.bounce_rate - desktop.bounce_rate).toFixed(1)}% more than desktop. Improve mobile layouts, increase touch target sizes to 44px minimum, simplify the mobile navigation, and ensure text is readable without zooming.`,
      });
    }
  }

  // Tablet-specific issues
  if (tablet && desktop) {
    if (tablet.error_rate > desktop.error_rate * 2) {
      recommendations.push({
        id: "tablet-errors",
        title: "Fix Tablet-Specific Errors",
        description: `Tablet error rate is ${tablet.error_rate.toFixed(1)}% vs desktop ${desktop.error_rate.toFixed(1)}%`,
        reasoning: "Tablet users experience more errors, likely due to responsive breakpoints",
        priority: "high",
        category: "bugs",
        current_value: tablet.error_rate,
        target_value: desktop.error_rate,
        action_items: [
          "Test on tablet viewports (768-1024px)",
          "Fix responsive breakpoint issues",
          "Ensure components scale properly",
          "Test landscape and portrait modes",
        ],
        impact: "Improve tablet user experience and reduce frustration",
        prompt: `Fix tablet-specific errors. Tablet error rate is ${(tablet.error_rate - desktop.error_rate).toFixed(1)}% higher than desktop. Test the app at tablet breakpoints (768-1024px), fix any responsive layout issues, and ensure all interactive elements work in both orientations.`,
      });
    }
  }

  return recommendations;
}

// Priority level weights for health score calculation
export const priorityWeights = {
  critical: 15,
  high: 10,
  medium: 5,
  low: 2,
};

// Calculate health score from recommendations
export function calculateHealthScoreFromRecommendations(recommendations: UXRecommendation[]): number {
  let score = 100;
  
  recommendations.forEach((rec) => {
    score -= priorityWeights[rec.priority] || 5;
  });

  return Math.max(0, Math.min(100, Math.round(score)));
}
