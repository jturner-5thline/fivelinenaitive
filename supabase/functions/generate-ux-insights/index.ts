import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAnon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to query analytics data (admin-only function)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Query all available activity data in parallel
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const since = thirtyDaysAgo.toISOString();

    const [
      pageViewsRes,
      rageClicksRes,
      errorsRes,
      navigationRes,
      searchEventsRes,
      feedbackRes,
      performanceRes,
      dealsRes,
      activityLogsRes,
      dealLendersRes,
    ] = await Promise.all([
      supabase
        .from("page_views")
        .select("page_path, session_id, device_type, created_at")
        .gte("created_at", since)
        .limit(1000),
      supabase
        .from("ux_rage_clicks")
        .select("page_path, element_selector, element_text, click_count, device_type")
        .limit(100),
      supabase
        .from("ux_client_errors")
        .select("page_path, error_type, error_message, component_name, created_at")
        .gte("created_at", since)
        .limit(200),
      supabase
        .from("ux_navigation_events")
        .select("to_path, from_path, is_bounce, is_exit, scroll_depth_percent, time_on_previous_page_ms, device_type")
        .gte("created_at", since)
        .limit(500),
      supabase
        .from("ux_search_events")
        .select("query, results_count, created_at")
        .gte("created_at", since)
        .limit(300),
      supabase
        .from("ux_user_feedback")
        .select("page_path, rating, comment, category, created_at")
        .gte("created_at", since)
        .limit(100),
      supabase
        .from("ux_performance_metrics")
        .select("metric_type, value_ms, device_type, page_path")
        .gte("created_at", since)
        .limit(300),
      supabase
        .from("deals")
        .select("id, stage, status, created_at, updated_at, deal_type, value")
        .limit(500),
      supabase
        .from("activity_logs")
        .select("activity_type, description, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("deal_lenders")
        .select("stage, tracking_status, created_at, updated_at")
        .limit(500),
    ]);

    // Aggregate data for the AI prompt
    const pageViews = pageViewsRes.data || [];
    const rageClicks = rageClicksRes.data || [];
    const errors = errorsRes.data || [];
    const navigation = navigationRes.data || [];
    const searchEvents = searchEventsRes.data || [];
    const feedback = feedbackRes.data || [];
    const performance = performanceRes.data || [];
    const deals = dealsRes.data || [];
    const activityLogs = activityLogsRes.data || [];
    const dealLenders = dealLendersRes.data || [];

    const hasRealData = pageViews.length > 0 || errors.length > 0 || deals.length > 0 || activityLogs.length > 0;

    // Summarize page views by path
    const pageViewSummary: Record<string, number> = {};
    pageViews.forEach((pv: any) => {
      pageViewSummary[pv.page_path] = (pageViewSummary[pv.page_path] || 0) + 1;
    });

    // Summarize errors
    const errorSummary: Record<string, number> = {};
    errors.forEach((e: any) => {
      const key = `${e.error_type}: ${(e.error_message || "unknown").substring(0, 80)}`;
      errorSummary[key] = (errorSummary[key] || 0) + 1;
    });

    // Summarize search queries
    const failedSearches = searchEvents.filter((s: any) => s.results_count === 0);
    const searchSummary = {
      total: searchEvents.length,
      failed: failedSearches.length,
      failRate: searchEvents.length > 0 ? ((failedSearches.length / searchEvents.length) * 100).toFixed(1) + "%" : "N/A",
      topFailedQueries: failedSearches.slice(0, 5).map((s: any) => s.query),
    };

    // Deal stage distribution
    const dealStages: Record<string, number> = {};
    deals.forEach((d: any) => {
      dealStages[d.stage || "Unknown"] = (dealStages[d.stage || "Unknown"] || 0) + 1;
    });

    // Deal lender stage distribution
    const lenderStages: Record<string, number> = {};
    dealLenders.forEach((dl: any) => {
      lenderStages[dl.stage || "Unknown"] = (lenderStages[dl.stage || "Unknown"] || 0) + 1;
    });

    // Activity type frequency
    const activityTypes: Record<string, number> = {};
    activityLogs.forEach((a: any) => {
      activityTypes[a.activity_type] = (activityTypes[a.activity_type] || 0) + 1;
    });

    // Navigation bounce/exit rates
    const bounces = navigation.filter((n: any) => n.is_bounce).length;
    const exits = navigation.filter((n: any) => n.is_exit).length;

    // Avg performance metrics
    const perfByType: Record<string, { sum: number; count: number }> = {};
    performance.forEach((p: any) => {
      if (!perfByType[p.metric_type]) perfByType[p.metric_type] = { sum: 0, count: 0 };
      perfByType[p.metric_type].sum += Number(p.value_ms) || 0;
      perfByType[p.metric_type].count++;
    });
    const avgPerf: Record<string, number> = {};
    Object.entries(perfByType).forEach(([k, v]) => {
      avgPerf[k] = Math.round(v.sum / v.count);
    });

    // Feedback summary
    const avgRating = feedback.length > 0
      ? (feedback.reduce((s: number, f: any) => s + (f.rating || 0), 0) / feedback.length).toFixed(1)
      : "N/A";

    const dataSummary = {
      period: "Last 30 days",
      hasRealData,
      pageViews: {
        total: pageViews.length,
        uniqueSessions: new Set(pageViews.map((p: any) => p.session_id)).size,
        byPage: pageViewSummary,
      },
      rageClicks: rageClicks.length > 0 ? rageClicks.slice(0, 10).map((r: any) => ({
        page: r.page_path,
        element: r.element_text || r.element_selector,
        clicks: r.click_count,
      })) : [],
      errors: {
        total: errors.length,
        byType: errorSummary,
      },
      navigation: {
        total: navigation.length,
        bounceRate: navigation.length > 0 ? ((bounces / navigation.length) * 100).toFixed(1) + "%" : "N/A",
        exitRate: navigation.length > 0 ? ((exits / navigation.length) * 100).toFixed(1) + "%" : "N/A",
      },
      search: searchSummary,
      performance: avgPerf,
      feedback: {
        count: feedback.length,
        avgRating,
      },
      deals: {
        total: deals.length,
        byStage: dealStages,
        activeCount: deals.filter((d: any) => d.status === "active").length,
      },
      lenders: {
        total: dealLenders.length,
        byStage: lenderStages,
      },
      activityLogs: {
        total: activityLogs.length,
        byType: activityTypes,
      },
    };

    const systemPrompt = `You are a senior product analytics expert for a B2B deal management / lending platform called "naitive". Analyze the provided user activity data and generate actionable product improvement insights.

Your task is to return a JSON array of insights. Each insight must have this structure:
{
  "title": string (short, specific, e.g. "Deal Write-Up page has 40% drop-off"),
  "description": string (2-3 sentences explaining the finding with data),
  "recommendation": string (specific, actionable improvement suggestion),
  "impact": "high" | "medium" | "low",
  "category": "UX" | "Feature" | "Workflow" | "Performance",
  "isSample": boolean (true if based on assumptions rather than real data)
}

Guidelines:
- Generate 6-10 insights
- If real data exists, base insights on actual patterns you see
- If data is sparse or empty, generate realistic sample insights based on common patterns in deal management platforms — mark these with "isSample": true
- Focus on: navigation bottlenecks, underused features, workflow drop-offs, error hotspots, search failures, performance issues, mobile gaps
- Be specific with numbers when data exists
- Recommendations should be concrete (not generic like "improve UX")

Return ONLY a JSON array, no markdown wrapping.`;

    const userPrompt = `Here is the platform activity data for analysis:

${JSON.stringify(dataSummary, null, 2)}

The platform has these main areas:
- Dashboard (home, widgets, notifications)
- Deals pipeline (deal cards, stages, write-ups, analysis)
- Deal Space (documents/data room, notes, AI Q&A, financial analysis)
- Lender management (master lenders, contacts, deal lenders, matching)
- AI Copilot (global assistant for deal Q&A and actions)
- Agents (automated workflows, triggers)
- Settings (company, integrations, team)
- Admin (user management, analytics, UX tracking)
- CRM (contacts, companies, activities)

Generate product improvement insights based on this data.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    let insights;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      insights = JSON.parse(jsonStr.trim());
    } catch {
      console.error("Failed to parse AI response:", content);
      insights = [{
        title: "Analysis Complete",
        description: content.substring(0, 300),
        recommendation: "Review the full analysis for detailed recommendations.",
        impact: "medium",
        category: "UX",
        isSample: false,
      }];
    }

    return new Response(JSON.stringify({ insights, hasRealData, dataSummary: { period: dataSummary.period, pageViewCount: dataSummary.pageViews.total, errorCount: dataSummary.errors.total, dealCount: dataSummary.deals.total } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-ux-insights error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
