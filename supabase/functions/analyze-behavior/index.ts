import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BehaviorAnalysis {
  insights: Array<{
    type: string;
    category: string;
    title: string;
    description: string;
    severity: string;
    data: Record<string, any>;
  }>;
  suggestions: Array<{
    name: string;
    description: string;
    reasoning: string;
    trigger_type: string;
    trigger_config: Record<string, any>;
    actions: Array<{ type: string; config: Record<string, any> }>;
    priority: string;
  }>;
  teamMetrics: Array<{
    metric_type: string;
    metric_value: number;
    breakdown: Record<string, any>;
  }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { companyId } = await req.json();

    // Gather behavior data
    const [
      dealsResult,
      activityResult,
      lendersResult,
      milestonesResult,
      featureUsageResult,
    ] = await Promise.all([
      // Get deals data
      supabase
        .from("deals")
        .select("id, company, stage, status, created_at, updated_at, user_id")
        .eq(companyId ? "company_id" : "user_id", companyId || user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      
      // Get activity logs
      supabase
        .from("activity_logs")
        .select("id, activity_type, created_at, deal_id, user_id")
        .order("created_at", { ascending: false })
        .limit(500),
      
      // Get lender data
      supabase
        .from("deal_lenders")
        .select("id, stage, substage, created_at, updated_at, deal_id")
        .order("created_at", { ascending: false })
        .limit(200),
      
      // Get milestones
      supabase
        .from("deal_milestones")
        .select("id, title, completed, due_date, completed_at, deal_id")
        .order("created_at", { ascending: false })
        .limit(100),
      
      // Get feature usage if available
      supabase
        .from("ux_feature_usage")
        .select("feature_name, action, created_at, user_id")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const deals = dealsResult.data || [];
    const activities = activityResult.data || [];
    const lenders = lendersResult.data || [];
    const milestones = milestonesResult.data || [];
    const featureUsage = featureUsageResult.data || [];

    // Analyze patterns
    const analysis = analyzePatterns({
      deals,
      activities,
      lenders,
      milestones,
      featureUsage,
      userId: user.id,
      companyId,
    });

    // Store insights
    if (analysis.insights.length > 0) {
      await supabase.from("user_behavior_insights").insert(
        analysis.insights.map((insight) => ({
          user_id: user.id,
          company_id: companyId || null,
          insight_type: insight.type,
          category: insight.category,
          title: insight.title,
          description: insight.description,
          severity: insight.severity,
          data: insight.data,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
        }))
      );
    }

    // Store suggestions
    if (analysis.suggestions.length > 0) {
      await supabase.from("workflow_suggestions").insert(
        analysis.suggestions.map((suggestion) => ({
          user_id: user.id,
          company_id: companyId || null,
          name: suggestion.name,
          description: suggestion.description,
          reasoning: suggestion.reasoning,
          trigger_type: suggestion.trigger_type,
          trigger_config: suggestion.trigger_config,
          actions: suggestion.actions,
          priority: suggestion.priority,
        }))
      );
    }

    // Store team metrics
    if (companyId && analysis.teamMetrics.length > 0) {
      for (const metric of analysis.teamMetrics) {
        await supabase.from("team_interaction_metrics").upsert(
          {
            company_id: companyId,
            metric_date: new Date().toISOString().split("T")[0],
            metric_type: metric.metric_type,
            metric_value: metric.metric_value,
            breakdown: metric.breakdown,
          },
          { onConflict: "company_id,metric_date,metric_type" }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        insights: analysis.insights.length,
        suggestions: analysis.suggestions.length,
        teamMetrics: analysis.teamMetrics.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error analyzing behavior:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function analyzePatterns(data: {
  deals: any[];
  activities: any[];
  lenders: any[];
  milestones: any[];
  featureUsage: any[];
  userId: string;
  companyId?: string;
}): BehaviorAnalysis {
  const insights: BehaviorAnalysis["insights"] = [];
  const suggestions: BehaviorAnalysis["suggestions"] = [];
  const teamMetrics: BehaviorAnalysis["teamMetrics"] = [];

  const { deals, activities, lenders, milestones, featureUsage } = data;

  // === DEAL ACTIVITY PATTERNS ===
  
  // Check for stale deals (no updates in 7+ days)
  const now = new Date();
  const staleDeals = deals.filter((d) => {
    const lastUpdate = new Date(d.updated_at);
    const daysSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate > 7 && d.status === "active";
  });

  if (staleDeals.length > 0) {
    insights.push({
      type: "bottleneck",
      category: "deal_activity",
      title: "Stale Deals Detected",
      description: `${staleDeals.length} deal(s) haven't been updated in over 7 days. Consider setting up automated reminders.`,
      severity: staleDeals.length > 3 ? "warning" : "info",
      data: { staleCount: staleDeals.length, dealIds: staleDeals.slice(0, 5).map((d) => d.id) },
    });

    suggestions.push({
      name: "Stale Deal Reminder",
      description: "Automatically notify you when deals become stale",
      reasoning: `You have ${staleDeals.length} stale deals. This workflow will help you stay on top of inactive deals.`,
      trigger_type: "scheduled",
      trigger_config: { schedule: "daily", time: "09:00" },
      actions: [
        {
          type: "send_notification",
          config: {
            title: "Stale Deal Alert",
            message: "Some deals haven't been updated recently. Review them to keep your pipeline moving.",
          },
        },
      ],
      priority: "high",
    });
  }

  // Check for deals stuck in early stages
  const stageDistribution: Record<string, number> = {};
  deals.forEach((d) => {
    stageDistribution[d.stage] = (stageDistribution[d.stage] || 0) + 1;
  });

  const prospectingDeals = stageDistribution["Prospecting"] || stageDistribution["prospecting"] || 0;
  const totalDeals = deals.length;
  if (totalDeals > 5 && prospectingDeals / totalDeals > 0.5) {
    insights.push({
      type: "bottleneck",
      category: "deal_activity",
      title: "Pipeline Bottleneck in Early Stage",
      description: `${Math.round((prospectingDeals / totalDeals) * 100)}% of deals are stuck in prospecting. Consider moving qualified deals forward.`,
      severity: "warning",
      data: { stageDistribution },
    });

    suggestions.push({
      name: "Stage Progression Reminder",
      description: "Get notified when deals stay in one stage too long",
      reasoning: "Many deals are stuck in early stages. This workflow helps you identify deals ready to progress.",
      trigger_type: "deal_stage_change",
      trigger_config: { fromStage: "", toStage: "Prospecting" },
      actions: [
        {
          type: "send_notification",
          config: {
            title: "New Deal in Prospecting",
            message: "Deal {{dealName}} is now in Prospecting. Set a follow-up reminder!",
            delayMinutes: 4320, // 3 days
          },
        },
      ],
      priority: "medium",
    });
  }

  // === TIME-BASED PATTERNS ===

  // Check for missed milestones
  const missedMilestones = milestones.filter((m) => {
    if (m.completed) return false;
    if (!m.due_date) return false;
    return new Date(m.due_date) < now;
  });

  if (missedMilestones.length > 0) {
    insights.push({
      type: "pattern",
      category: "time_patterns",
      title: "Overdue Milestones",
      description: `${missedMilestones.length} milestone(s) are past their due date. Consider automating milestone reminders.`,
      severity: missedMilestones.length > 2 ? "critical" : "warning",
      data: { overdueCount: missedMilestones.length },
    });

    suggestions.push({
      name: "Milestone Due Date Reminder",
      description: "Get reminded before milestone due dates",
      reasoning: `You have ${missedMilestones.length} overdue milestones. Automated reminders can help prevent this.`,
      trigger_type: "scheduled",
      trigger_config: { schedule: "daily", time: "08:00" },
      actions: [
        {
          type: "send_notification",
          config: {
            title: "Milestone Reminder",
            message: "Check your upcoming milestones - some may be due soon!",
          },
        },
      ],
      priority: "high",
    });
  }

  // === LENDER ACTIVITY PATTERNS ===

  // Check for lenders stuck in early stages
  const lenderStages: Record<string, number> = {};
  lenders.forEach((l) => {
    lenderStages[l.stage] = (lenderStages[l.stage] || 0) + 1;
  });

  const outreachLenders = lenderStages["Outreach"] || lenderStages["outreach"] || 0;
  if (lenders.length > 5 && outreachLenders / lenders.length > 0.6) {
    insights.push({
      type: "bottleneck",
      category: "deal_activity",
      title: "Lender Engagement Bottleneck",
      description: `${Math.round((outreachLenders / lenders.length) * 100)}% of lenders are still in outreach. Track responses more closely.`,
      severity: "info",
      data: { lenderStages },
    });

    suggestions.push({
      name: "Lender Response Tracker",
      description: "Get notified when lenders respond or move stages",
      reasoning: "Many lenders are stuck in outreach. This helps you track when they engage.",
      trigger_type: "lender_stage_change",
      trigger_config: { fromStage: "Outreach", toStage: "" },
      actions: [
        {
          type: "send_notification",
          config: {
            title: "Lender Responded!",
            message: "{{lenderName}} has moved from Outreach. Review their response.",
          },
        },
      ],
      priority: "medium",
    });
  }

  // === FEATURE ADOPTION ===

  // Check if workflows are being used
  const workflowUsage = featureUsage.filter((f) => 
    f.feature_name?.includes("workflow") || f.feature_name?.includes("automation")
  );

  if (workflowUsage.length < 3 && deals.length > 5) {
    insights.push({
      type: "opportunity",
      category: "feature_adoption",
      title: "Automation Opportunity",
      description: "You're not using workflow automations much. Automating repetitive tasks can save hours per week.",
      severity: "info",
      data: { currentUsage: workflowUsage.length },
    });
  }

  // === TEAM METRICS ===

  if (data.companyId) {
    // Calculate average response time (time between activities)
    const activityTimes = activities
      .filter((a) => a.created_at)
      .map((a) => new Date(a.created_at).getTime())
      .sort((a, b) => b - a);

    if (activityTimes.length > 1) {
      const gaps: number[] = [];
      for (let i = 0; i < activityTimes.length - 1 && i < 50; i++) {
        gaps.push(activityTimes[i] - activityTimes[i + 1]);
      }
      const avgGapHours = gaps.reduce((a, b) => a + b, 0) / gaps.length / (1000 * 60 * 60);
      
      teamMetrics.push({
        metric_type: "avg_response_time",
        metric_value: Math.round(avgGapHours * 10) / 10,
        breakdown: { unit: "hours", sampleSize: gaps.length },
      });
    }

    // Calculate stage duration averages
    const stageDurations: Record<string, number[]> = {};
    deals.forEach((d) => {
      const created = new Date(d.created_at).getTime();
      const updated = new Date(d.updated_at).getTime();
      const durationDays = (updated - created) / (1000 * 60 * 60 * 24);
      if (!stageDurations[d.stage]) stageDurations[d.stage] = [];
      stageDurations[d.stage].push(durationDays);
    });

    const stageAvgs: Record<string, number> = {};
    Object.entries(stageDurations).forEach(([stage, durations]) => {
      stageAvgs[stage] = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    });

    teamMetrics.push({
      metric_type: "stage_duration",
      metric_value: Object.values(stageAvgs).reduce((a, b) => a + b, 0) / Object.keys(stageAvgs).length || 0,
      breakdown: { byStage: stageAvgs },
    });

    // Collaboration score based on activity diversity
    const uniqueUsers = new Set(activities.map((a) => a.user_id)).size;
    const collaborationScore = Math.min(100, uniqueUsers * 20);
    
    teamMetrics.push({
      metric_type: "collaboration_score",
      metric_value: collaborationScore,
      breakdown: { uniqueUsers, totalActivities: activities.length },
    });
  }

  return { insights, suggestions, teamMetrics };
}
