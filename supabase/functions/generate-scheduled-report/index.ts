import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

interface ReportConfig {
  report_type: string;
  filters?: {
    stages?: string[];
    statuses?: string[];
    date_range_days?: number;
    min_value?: number;
  };
  include_lenders?: boolean;
  include_milestones?: boolean;
  include_activities?: boolean;
  ai_summary?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SLACK_API_KEY = Deno.env.get("SLACK_API_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "generate_report":
        return await handleGenerateReport(body, supabase, LOVABLE_API_KEY, SLACK_API_KEY);

      case "run_scheduled":
        return await handleRunScheduled(body, supabase, supabaseUrl, LOVABLE_API_KEY, SLACK_API_KEY);

      case "process_all_scheduled":
        return await handleProcessAllScheduled(supabase, supabaseUrl, supabaseServiceKey);

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Report generator error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Generate a report on-demand or for a scheduled run ───────────────────────
async function handleGenerateReport(
  body: { report_type: string; company_id?: string; config?: ReportConfig; delivery?: { method: string; slack_channel_id?: string } },
  supabase: ReturnType<typeof createClient>,
  lovableKey: string,
  slackKey: string | undefined
) {
  const { report_type, company_id, config = {} as ReportConfig, delivery } = body;
  const startTime = Date.now();

  // ── Gather data based on report type ──
  const reportData = await gatherReportData(supabase, report_type, company_id, config);

  // ── Generate AI summary if requested ──
  let aiSummary: string | null = null;
  if (config.ai_summary !== false) {
    aiSummary = await generateAISummary(reportData, report_type, lovableKey);
  }

  // ── Format for Slack delivery ──
  const slackMessage = formatReportForSlack(reportData, report_type, aiSummary);

  // ── Deliver ──
  let deliveryResult = null;
  if (delivery?.method === "slack" && delivery.slack_channel_id && slackKey) {
    deliveryResult = await sendSlackReport(
      delivery.slack_channel_id,
      slackMessage,
      lovableKey,
      slackKey
    );
  }

  const duration = Date.now() - startTime;

  return new Response(
    JSON.stringify({
      success: true,
      report_data: reportData,
      summary: aiSummary,
      slack_message: slackMessage,
      delivery: deliveryResult,
      duration_ms: duration,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ─── Gather report data from database ─────────────────────────────────────────
async function gatherReportData(
  supabase: ReturnType<typeof createClient>,
  reportType: string,
  companyId: string | undefined,
  config: ReportConfig
) {
  const filters = config.filters || {};

  switch (reportType) {
    case "pipeline_summary":
      return await gatherPipelineSummary(supabase, companyId, filters);
    case "lender_performance":
      return await gatherLenderPerformance(supabase, companyId, filters);
    case "stale_deals":
      return await gatherStaleDeals(supabase, companyId, filters);
    case "weekly_activity":
      return await gatherWeeklyActivity(supabase, companyId, filters);
    case "deal_velocity":
      return await gatherDealVelocity(supabase, companyId, filters);
    default:
      return await gatherPipelineSummary(supabase, companyId, filters);
  }
}

async function gatherPipelineSummary(
  supabase: ReturnType<typeof createClient>,
  companyId: string | undefined,
  filters: ReportConfig["filters"]
) {
  let query = supabase.from("deals").select("id, company, stage, status, value, deal_type, created_at, updated_at, user_id");
  if (companyId) query = query.eq("company_id", companyId);
  if (filters?.statuses?.length) query = query.in("status", filters.statuses);
  if (filters?.stages?.length) query = query.in("stage", filters.stages);

  const { data: deals, error } = await query.order("updated_at", { ascending: false }).limit(500);
  if (error) throw error;

  // Aggregate by stage
  const stageGroups: Record<string, { count: number; total_value: number; deals: string[] }> = {};
  let totalValue = 0;
  let activeCount = 0;

  for (const deal of deals || []) {
    const stage = deal.stage || "Unknown";
    if (!stageGroups[stage]) stageGroups[stage] = { count: 0, total_value: 0, deals: [] };
    stageGroups[stage].count++;
    stageGroups[stage].total_value += deal.value || 0;
    stageGroups[stage].deals.push(deal.company);
    totalValue += deal.value || 0;
    if (deal.status === "active") activeCount++;
  }

  return {
    type: "pipeline_summary",
    total_deals: deals?.length || 0,
    active_deals: activeCount,
    total_value: totalValue,
    by_stage: stageGroups,
    generated_at: new Date().toISOString(),
  };
}

async function gatherLenderPerformance(
  supabase: ReturnType<typeof createClient>,
  companyId: string | undefined,
  _filters: ReportConfig["filters"]
) {
  // Use the existing RPC for lender stats
  const { data: stats, error } = await supabase.rpc("get_lender_deal_stats", {
    _company_id: companyId || "00000000-0000-0000-0000-000000000000",
    _limit: 25,
  });

  if (error) throw error;

  return {
    type: "lender_performance",
    lenders: (stats || []).map((l: { lender_name: string; deal_count: number; active_count: number; funded_count: number; total_volume: number }) => ({
      name: l.lender_name,
      deal_count: l.deal_count,
      active_count: l.active_count,
      funded_count: l.funded_count,
      total_volume: l.total_volume,
      conversion_rate: l.deal_count > 0 ? ((l.funded_count / l.deal_count) * 100).toFixed(1) + "%" : "0%",
    })),
    generated_at: new Date().toISOString(),
  };
}

async function gatherStaleDeals(
  supabase: ReturnType<typeof createClient>,
  companyId: string | undefined,
  filters: ReportConfig["filters"]
) {
  const staleDays = filters?.date_range_days || 7;
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - staleDays);

  let query = supabase
    .from("deals")
    .select("id, company, stage, status, value, updated_at")
    .eq("status", "active")
    .lt("updated_at", staleDate.toISOString())
    .order("updated_at", { ascending: true });

  if (companyId) query = query.eq("company_id", companyId);

  const { data: deals, error } = await query.limit(50);
  if (error) throw error;

  return {
    type: "stale_deals",
    stale_threshold_days: staleDays,
    stale_count: deals?.length || 0,
    deals: (deals || []).map((d: { company: string; stage: string; value: number; updated_at: string }) => ({
      company: d.company,
      stage: d.stage,
      value: d.value,
      days_stale: Math.floor((Date.now() - new Date(d.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
    })),
    generated_at: new Date().toISOString(),
  };
}

async function gatherWeeklyActivity(
  supabase: ReturnType<typeof createClient>,
  companyId: string | undefined,
  _filters: ReportConfig["filters"]
) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Get activities from last 7 days
  let actQuery = supabase
    .from("activity_logs")
    .select("id, deal_id, activity_type, description, created_at, user_display_name")
    .gte("created_at", weekAgo.toISOString())
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: activities, error: actError } = await actQuery;
  if (actError) throw actError;

  // Group by activity type
  const byType: Record<string, number> = {};
  for (const a of activities || []) {
    byType[a.activity_type] = (byType[a.activity_type] || 0) + 1;
  }

  // New deals this week
  let dealsQuery = supabase
    .from("deals")
    .select("id, company, stage, value")
    .gte("created_at", weekAgo.toISOString());
  if (companyId) dealsQuery = dealsQuery.eq("company_id", companyId);

  const { data: newDeals } = await dealsQuery;

  return {
    type: "weekly_activity",
    period: { from: weekAgo.toISOString(), to: new Date().toISOString() },
    total_activities: activities?.length || 0,
    by_type: byType,
    new_deals: (newDeals || []).map((d: { company: string; stage: string; value: number }) => ({
      company: d.company,
      stage: d.stage,
      value: d.value,
    })),
    generated_at: new Date().toISOString(),
  };
}

async function gatherDealVelocity(
  supabase: ReturnType<typeof createClient>,
  companyId: string | undefined,
  _filters: ReportConfig["filters"]
) {
  let query = supabase
    .from("deals")
    .select("id, company, stage, status, value, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (companyId) query = query.eq("company_id", companyId);

  const { data: deals, error } = await query;
  if (error) throw error;

  // Calculate average days in pipeline
  const velocities = (deals || []).map((d: { company: string; stage: string; status: string; value: number; created_at: string; updated_at: string }) => {
    const daysInPipeline = Math.floor(
      (new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    return { company: d.company, stage: d.stage, status: d.status, value: d.value, days_in_pipeline: daysInPipeline };
  });

  const avgDays = velocities.length > 0
    ? Math.round(velocities.reduce((s, v) => s + v.days_in_pipeline, 0) / velocities.length)
    : 0;

  return {
    type: "deal_velocity",
    total_deals: velocities.length,
    avg_days_in_pipeline: avgDays,
    fastest: velocities.sort((a, b) => a.days_in_pipeline - b.days_in_pipeline).slice(0, 5),
    slowest: velocities.sort((a, b) => b.days_in_pipeline - a.days_in_pipeline).slice(0, 5),
    generated_at: new Date().toISOString(),
  };
}

// ─── AI Summary Generation ────────────────────────────────────────────────────
async function generateAISummary(
  reportData: Record<string, unknown>,
  reportType: string,
  lovableKey: string
): Promise<string> {
  const typeLabels: Record<string, string> = {
    pipeline_summary: "Pipeline Summary",
    lender_performance: "Lender Performance",
    stale_deals: "Stale Deals Alert",
    weekly_activity: "Weekly Activity Recap",
    deal_velocity: "Deal Velocity Analysis",
  };

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are a private credit analyst assistant. Generate a concise executive summary (3-5 bullet points) for a ${typeLabels[reportType] || reportType} report. Use Slack formatting (*bold*, _italic_). Focus on actionable insights, trends, and items needing attention. Be specific with numbers.`,
        },
        {
          role: "user",
          content: `Summarize this report data:\n\n${JSON.stringify(reportData, null, 2)}`,
        },
      ],
      temperature: 0.5,
    }),
  });

  if (!resp.ok) {
    console.error("AI summary error:", resp.status);
    return "_(AI summary unavailable)_";
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "_(No summary generated)_";
}

// ─── Format report for Slack ──────────────────────────────────────────────────
function formatReportForSlack(
  reportData: Record<string, unknown>,
  reportType: string,
  aiSummary: string | null
): string {
  const typeEmoji: Record<string, string> = {
    pipeline_summary: "📊",
    lender_performance: "🏦",
    stale_deals: "⚠️",
    weekly_activity: "📅",
    deal_velocity: "⚡",
  };

  const typeTitle: Record<string, string> = {
    pipeline_summary: "Pipeline Summary",
    lender_performance: "Lender Performance",
    stale_deals: "Stale Deals Alert",
    weekly_activity: "Weekly Activity Recap",
    deal_velocity: "Deal Velocity Analysis",
  };

  const emoji = typeEmoji[reportType] || "📋";
  const title = typeTitle[reportType] || "Report";
  let msg = `${emoji} *${title}*\n_Generated ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}_\n\n`;

  // Type-specific formatting
  switch (reportType) {
    case "pipeline_summary": {
      const data = reportData as { total_deals: number; active_deals: number; total_value: number; by_stage: Record<string, { count: number; total_value: number }> };
      msg += `*Total Deals:* ${data.total_deals} | *Active:* ${data.active_deals} | *Total Value:* $${(data.total_value / 1000000).toFixed(1)}M\n\n`;
      msg += `*By Stage:*\n`;
      for (const [stage, info] of Object.entries(data.by_stage || {})) {
        msg += `• ${stage}: ${info.count} deals — $${(info.total_value / 1000000).toFixed(1)}M\n`;
      }
      break;
    }
    case "lender_performance": {
      const data = reportData as { lenders: Array<{ name: string; deal_count: number; funded_count: number; total_volume: number; conversion_rate: string }> };
      msg += `*Top Lenders:*\n`;
      for (const l of (data.lenders || []).slice(0, 10)) {
        msg += `• *${l.name}*: ${l.deal_count} deals, ${l.funded_count} funded, $${(l.total_volume / 1000000).toFixed(1)}M vol (${l.conversion_rate})\n`;
      }
      break;
    }
    case "stale_deals": {
      const data = reportData as { stale_count: number; stale_threshold_days: number; deals: Array<{ company: string; stage: string; days_stale: number }> };
      msg += `*${data.stale_count} deals* with no updates in ${data.stale_threshold_days}+ days:\n\n`;
      for (const d of (data.deals || []).slice(0, 15)) {
        msg += `• *${d.company}* — ${d.stage} — _${d.days_stale} days stale_\n`;
      }
      break;
    }
    case "weekly_activity": {
      const data = reportData as { total_activities: number; by_type: Record<string, number>; new_deals: Array<{ company: string; value: number }> };
      msg += `*${data.total_activities} activities* this week\n\n`;
      for (const [type, count] of Object.entries(data.by_type || {})) {
        msg += `• ${type}: ${count}\n`;
      }
      if (data.new_deals?.length) {
        msg += `\n*New Deals:*\n`;
        for (const d of data.new_deals) {
          msg += `• ${d.company} — $${((d.value || 0) / 1000000).toFixed(1)}M\n`;
        }
      }
      break;
    }
    case "deal_velocity": {
      const data = reportData as { avg_days_in_pipeline: number; fastest: Array<{ company: string; days_in_pipeline: number }>; slowest: Array<{ company: string; days_in_pipeline: number }> };
      msg += `*Avg days in pipeline:* ${data.avg_days_in_pipeline}\n\n`;
      msg += `*Fastest:*\n`;
      for (const d of (data.fastest || []).slice(0, 3)) {
        msg += `• ${d.company}: ${d.days_in_pipeline} days\n`;
      }
      msg += `\n*Slowest:*\n`;
      for (const d of (data.slowest || []).slice(0, 3)) {
        msg += `• ${d.company}: ${d.days_in_pipeline} days\n`;
      }
      break;
    }
  }

  if (aiSummary) {
    msg += `\n───────────────────\n🤖 *AI Insights:*\n${aiSummary}`;
  }

  return msg;
}

// ─── Send report to Slack ─────────────────────────────────────────────────────
async function sendSlackReport(
  channelId: string,
  message: string,
  lovableKey: string,
  slackKey: string
) {
  const resp = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": slackKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelId,
      text: message,
      username: "Dashboard Bot",
      icon_emoji: "📊",
    }),
  });

  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    console.error("Slack delivery failed:", data);
    return { success: false, error: data.error };
  }
  return { success: true, ts: data.ts };
}

// ─── Run a specific scheduled report ──────────────────────────────────────────
async function handleRunScheduled(
  body: { scheduled_report_id: string },
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  lovableKey: string,
  slackKey: string | undefined
) {
  const { scheduled_report_id } = body;

  const { data: report, error } = await supabase
    .from("scheduled_reports")
    .select("*")
    .eq("id", scheduled_report_id)
    .single();

  if (error || !report) throw new Error("Scheduled report not found");

  // Create run record
  const { data: run, error: runError } = await supabase
    .from("report_runs")
    .insert({
      scheduled_report_id: report.id,
      user_id: report.user_id,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (runError) throw runError;

  const startTime = Date.now();

  try {
    const reportConfig = report.report_config as ReportConfig;
    const deliveryConfig = report.delivery_config as { slack_channel_id?: string };

    // Generate report
    const reportData = await gatherReportData(supabase, report.report_type, report.company_id, reportConfig);
    const aiSummary = await generateAISummary(reportData, report.report_type, lovableKey);
    const slackMessage = formatReportForSlack(reportData, report.report_type, aiSummary);

    // Deliver
    let deliveryResult = null;
    if (report.delivery_method === "slack" && deliveryConfig.slack_channel_id && slackKey) {
      deliveryResult = await sendSlackReport(deliveryConfig.slack_channel_id, slackMessage, lovableKey, slackKey);
    }

    const duration = Date.now() - startTime;

    // Update run
    await supabase
      .from("report_runs")
      .update({
        status: "completed",
        report_data: reportData,
        summary_text: aiSummary,
        delivery_status: deliveryResult?.success ? "delivered" : "failed",
        delivery_response: deliveryResult,
        completed_at: new Date().toISOString(),
        duration_ms: duration,
      })
      .eq("id", run.id);

    // Update scheduled report
    await supabase
      .from("scheduled_reports")
      .update({
        last_run_at: new Date().toISOString(),
      })
      .eq("id", report.id);

    return new Response(
      JSON.stringify({ success: true, run_id: run.id, duration_ms: duration }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    await supabase
      .from("report_runs")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      })
      .eq("id", run.id);

    throw err;
  }
}

// ─── Process all due scheduled reports (cron entry point) ─────────────────────
async function handleProcessAllScheduled(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string
) {
  const now = new Date().toISOString();

  const { data: dueReports, error } = await supabase
    .from("scheduled_reports")
    .select("*")
    .eq("is_active", true)
    .or(`next_run_at.is.null,next_run_at.lte.${now}`);

  if (error) throw error;

  console.log(`Found ${dueReports?.length || 0} scheduled reports to process`);

  const results = [];

  for (const report of dueReports || []) {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/generate-scheduled-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          action: "run_scheduled",
          scheduled_report_id: report.id,
        }),
      });

      const result = await resp.json();
      results.push({ report_id: report.id, ...result });
    } catch (err) {
      console.error(`Error processing report ${report.id}:`, err);
      results.push({ report_id: report.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
