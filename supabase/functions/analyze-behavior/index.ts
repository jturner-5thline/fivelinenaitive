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
  agentSuggestions: Array<{
    name: string;
    description: string;
    reasoning: string;
    suggested_prompt: string;
    suggested_triggers: Array<{ trigger_type: string; description: string }>;
    priority: string;
    category: string;
    template_id?: string;
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
      agentsResult,
      templatesResult,
    ] = await Promise.all([
      // Get deals data
      supabase
        .from("deals")
        .select("id, company, stage, status, value, created_at, updated_at, user_id")
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
        .select("id, name, stage, substage, created_at, updated_at, deal_id")
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

      // Get existing agents to avoid duplicate suggestions
      supabase
        .from("agents")
        .select("id, name, system_prompt")
        .eq("user_id", user.id)
        .limit(20),

      // Get agent templates for matching
      supabase
        .from("agent_templates")
        .select("id, name, category, description, system_prompt")
        .limit(20),
    ]);

    const deals = dealsResult.data || [];
    const activities = activityResult.data || [];
    const lenders = lendersResult.data || [];
    const milestones = milestonesResult.data || [];
    const featureUsage = featureUsageResult.data || [];
    const existingAgents = agentsResult.data || [];
    const templates = templatesResult.data || [];

    // Analyze patterns
    const analysis = analyzePatterns({
      deals,
      activities,
      lenders,
      milestones,
      featureUsage,
      existingAgents,
      templates,
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
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }))
      );
    }

    // Store workflow suggestions
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

    // Store agent suggestions
    if (analysis.agentSuggestions.length > 0) {
      await supabase.from("agent_suggestions").insert(
        analysis.agentSuggestions.map((suggestion) => ({
          user_id: user.id,
          company_id: companyId || null,
          template_id: suggestion.template_id || null,
          name: suggestion.name,
          description: suggestion.description,
          reasoning: suggestion.reasoning,
          suggested_prompt: suggestion.suggested_prompt,
          suggested_triggers: suggestion.suggested_triggers,
          priority: suggestion.priority,
          category: suggestion.category,
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
        agentSuggestions: analysis.agentSuggestions.length,
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
  existingAgents: any[];
  templates: any[];
  userId: string;
  companyId?: string;
}): BehaviorAnalysis {
  const insights: BehaviorAnalysis["insights"] = [];
  const suggestions: BehaviorAnalysis["suggestions"] = [];
  const agentSuggestions: BehaviorAnalysis["agentSuggestions"] = [];
  const teamMetrics: BehaviorAnalysis["teamMetrics"] = [];

  const { deals, activities, lenders, milestones, featureUsage, existingAgents, templates } = data;
  const existingAgentNames = existingAgents.map((a) => a.name.toLowerCase());

  // Helper to check if agent already exists
  const hasAgentLike = (name: string) => 
    existingAgentNames.some((n) => n.includes(name.toLowerCase()) || name.toLowerCase().includes(n));

  // Helper to find matching template
  const findTemplate = (category: string) => 
    templates.find((t) => t.category?.toLowerCase() === category.toLowerCase());

  // === DEAL ACTIVITY PATTERNS ===
  const now = new Date();

  // Check for stale deals
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
      description: `${staleDeals.length} deal(s) haven't been updated in over 7 days.`,
      severity: staleDeals.length > 3 ? "warning" : "info",
      data: { staleCount: staleDeals.length, dealIds: staleDeals.slice(0, 5).map((d) => d.id) },
    });

    suggestions.push({
      name: "Stale Deal Reminder",
      description: "Automatically notify you when deals become stale",
      reasoning: `You have ${staleDeals.length} stale deals. This workflow will help you stay on top of inactive deals.`,
      trigger_type: "scheduled",
      trigger_config: { schedule: "daily", time: "09:00" },
      actions: [{ type: "send_notification", config: { title: "Stale Deal Alert", message: "Some deals haven't been updated recently." } }],
      priority: "high",
    });

    // Suggest Pipeline Health Monitor agent
    if (!hasAgentLike("pipeline") && !hasAgentLike("health")) {
      const template = findTemplate("pipeline");
      agentSuggestions.push({
        name: "Pipeline Health Monitor",
        description: "An AI agent that monitors your pipeline health and alerts you to stale or at-risk deals",
        reasoning: `You have ${staleDeals.length} stale deals. A Pipeline Health Monitor agent can proactively identify and alert you about deals that need attention.`,
        suggested_prompt: "You are a pipeline health analyst. Monitor all active deals and identify those that haven't been updated in over 7 days. For each stale deal, suggest next actions and prioritize based on deal value and time since last activity.",
        suggested_triggers: [
          { trigger_type: "scheduled", description: "Run daily at 8 AM to check pipeline health" },
          { trigger_type: "deal_stage_change", description: "Analyze when deals change stages" },
        ],
        priority: "high",
        category: "pipeline",
        template_id: template?.id,
      });
    }
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
      description: `${Math.round((prospectingDeals / totalDeals) * 100)}% of deals are stuck in prospecting.`,
      severity: "warning",
      data: { stageDistribution },
    });

    suggestions.push({
      name: "Stage Progression Reminder",
      description: "Get notified when deals stay in one stage too long",
      reasoning: "Many deals are stuck in early stages.",
      trigger_type: "deal_stage_change",
      trigger_config: { fromStage: "", toStage: "Prospecting" },
      actions: [{ type: "send_notification", config: { title: "New Deal in Prospecting", message: "Set a follow-up reminder!", delayMinutes: 4320 } }],
      priority: "medium",
    });
  }

  // === LENDER ENGAGEMENT PATTERNS ===

  const lenderStages: Record<string, number> = {};
  lenders.forEach((l) => {
    lenderStages[l.stage] = (lenderStages[l.stage] || 0) + 1;
  });

  const outreachLenders = lenderStages["Outreach"] || lenderStages["outreach"] || 0;
  const totalLenders = lenders.length;

  if (totalLenders > 5) {
    // Suggest Lender Matcher agent if many lenders
    if (!hasAgentLike("lender") && !hasAgentLike("matcher")) {
      const template = findTemplate("lender");
      agentSuggestions.push({
        name: "Lender Matcher AI",
        description: "An AI agent that analyzes deal characteristics and recommends the best-fit lenders",
        reasoning: `You're managing ${totalLenders} lender relationships. An AI Lender Matcher can help you quickly identify the best lenders for each deal based on historical patterns.`,
        suggested_prompt: "You are a lender matching specialist. Analyze deal details including size, industry, geography, and structure. Match these against lender preferences and historical success rates. Provide ranked recommendations with confidence scores.",
        suggested_triggers: [
          { trigger_type: "new_deal", description: "Suggest lenders when new deals are created" },
          { trigger_type: "deal_stage_change", description: "Update recommendations as deals progress" },
        ],
        priority: "high",
        category: "lender",
        template_id: template?.id,
      });
    }

    if (outreachLenders / totalLenders > 0.6) {
      insights.push({
        type: "bottleneck",
        category: "deal_activity",
        title: "Lender Engagement Bottleneck",
        description: `${Math.round((outreachLenders / totalLenders) * 100)}% of lenders are still in outreach.`,
        severity: "info",
        data: { lenderStages },
      });

      suggestions.push({
        name: "Lender Response Tracker",
        description: "Get notified when lenders respond",
        reasoning: "Many lenders are stuck in outreach.",
        trigger_type: "lender_stage_change",
        trigger_config: { fromStage: "Outreach", toStage: "" },
        actions: [{ type: "send_notification", config: { title: "Lender Responded!", message: "{{lenderName}} has moved from Outreach." } }],
        priority: "medium",
      });
    }
  }

  // === MILESTONE PATTERNS ===

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
      description: `${missedMilestones.length} milestone(s) are past their due date.`,
      severity: missedMilestones.length > 2 ? "critical" : "warning",
      data: { overdueCount: missedMilestones.length },
    });

    suggestions.push({
      name: "Milestone Due Date Reminder",
      description: "Get reminded before milestone due dates",
      reasoning: `You have ${missedMilestones.length} overdue milestones.`,
      trigger_type: "scheduled",
      trigger_config: { schedule: "daily", time: "08:00" },
      actions: [{ type: "send_notification", config: { title: "Milestone Reminder", message: "Check your upcoming milestones!" } }],
      priority: "high",
    });
  }

  // === ACTIVITY PATTERNS ===

  const activityTypes: Record<string, number> = {};
  activities.forEach((a) => {
    activityTypes[a.activity_type] = (activityTypes[a.activity_type] || 0) + 1;
  });

  const totalActivities = activities.length;

  if (totalActivities > 50) {
    // Suggest Activity Summarizer if lots of activity
    if (!hasAgentLike("activity") && !hasAgentLike("summarizer")) {
      const template = findTemplate("activity");
      agentSuggestions.push({
        name: "Activity Summarizer",
        description: "An AI agent that generates concise summaries of deal activity for stakeholder updates",
        reasoning: `You have ${totalActivities} recent activities. An Activity Summarizer agent can help you quickly generate status updates and stakeholder reports.`,
        suggested_prompt: "You are a deal activity summarizer. Review recent activities for a deal and generate a concise executive summary highlighting key developments, decisions made, and next steps. Format for easy stakeholder consumption.",
        suggested_triggers: [
          { trigger_type: "scheduled", description: "Generate weekly summaries every Monday" },
          { trigger_type: "deal_stage_change", description: "Summarize when deals reach key milestones" },
        ],
        priority: "medium",
        category: "activity",
        template_id: template?.id,
      });
    }
  }

  // === HIGH-VALUE DEAL PATTERNS ===

  const highValueDeals = deals.filter((d) => d.value && d.value > 5000000);

  if (highValueDeals.length > 2) {
    // Suggest Risk Assessor for high-value deals
    if (!hasAgentLike("risk") && !hasAgentLike("assessor")) {
      const template = findTemplate("risk");
      agentSuggestions.push({
        name: "Deal Risk Assessor",
        description: "An AI agent that analyzes deals for potential risks and provides mitigation strategies",
        reasoning: `You have ${highValueDeals.length} high-value deals (>$5M). A Risk Assessor agent can help identify and mitigate risks before they become problems.`,
        suggested_prompt: "You are a deal risk analyst. Analyze deal characteristics, lender feedback, timeline, and market conditions. Identify potential risks categorized by severity. Suggest specific mitigation strategies for each risk.",
        suggested_triggers: [
          { trigger_type: "new_deal", description: "Assess new deals upon creation" },
          { trigger_type: "deal_stage_change", description: "Re-assess when deals progress" },
        ],
        priority: "high",
        category: "risk",
        template_id: template?.id,
      });
    }
  }

  // === FEATURE ADOPTION ===

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

  // === COMPETITIVE ANALYSIS OPPORTUNITY ===

  if (deals.length > 10 && !hasAgentLike("competitive") && !hasAgentLike("intel")) {
    const template = findTemplate("competitive");
    agentSuggestions.push({
      name: "Competitive Intel Agent",
      description: "An AI agent that tracks market trends and competitive insights relevant to your deals",
      reasoning: `With ${deals.length} deals in your pipeline, staying informed about market conditions and competition is crucial for success.`,
      suggested_prompt: "You are a competitive intelligence analyst. Monitor market trends, competitor activities, and industry news relevant to the deal's sector. Provide actionable insights that could impact deal strategy or positioning.",
      suggested_triggers: [
        { trigger_type: "scheduled", description: "Weekly market intelligence briefing" },
        { trigger_type: "new_deal", description: "Research competitive landscape for new deals" },
      ],
      priority: "medium",
      category: "competitive",
      template_id: template?.id,
    });
  }

  // === TEAM METRICS ===

  if (data.companyId) {
    // Calculate average response time
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

      // Suggest team coordination agent for slower response times
      if (avgGapHours > 24 && !hasAgentLike("team") && !hasAgentLike("coordination")) {
        agentSuggestions.push({
          name: "Team Coordination Agent",
          description: "An AI agent that helps coordinate team activities and ensures timely follow-ups",
          reasoning: `Your average activity gap is ${Math.round(avgGapHours)} hours. A coordination agent can help improve team responsiveness.`,
          suggested_prompt: "You are a team coordination assistant. Monitor deal activities and identify gaps in response times. Suggest task assignments and follow-up reminders to keep deals moving forward efficiently.",
          suggested_triggers: [
            { trigger_type: "scheduled", description: "Daily team activity review" },
          ],
          priority: "medium",
          category: "team",
        });
      }
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

    // Collaboration score
    const uniqueUsers = new Set(activities.map((a) => a.user_id)).size;
    const collaborationScore = Math.min(100, uniqueUsers * 20);
    
    teamMetrics.push({
      metric_type: "collaboration_score",
      metric_value: collaborationScore,
      breakdown: { uniqueUsers, totalActivities: activities.length },
    });
  }

  return { insights, suggestions, agentSuggestions, teamMetrics };
}
