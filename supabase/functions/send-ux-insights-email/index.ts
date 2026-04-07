import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const isCron = authHeader === `Bearer ${cronSecret}` || authHeader === `Bearer ${anonKey}`;

    if (!isCron) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const sb = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader || "" } },
      });
      const { data: { user }, error } = await sb.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const resend = new Resend(RESEND_API_KEY);
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── 1. Gather platform data ──
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const since = thirtyDaysAgo.toISOString();

    const [
      pageViewsRes, rageClicksRes, errorsRes, navigationRes,
      searchEventsRes, feedbackRes, performanceRes,
      dealsRes, activityLogsRes, dealLendersRes,
      prevScoreRes,
    ] = await Promise.all([
      supabase.from("page_views").select("page_path, session_id, device_type, created_at").gte("created_at", since).limit(1000),
      supabase.from("ux_rage_clicks").select("page_path, element_selector, element_text, click_count, device_type").limit(100),
      supabase.from("ux_client_errors").select("page_path, error_type, error_message, component_name, created_at").gte("created_at", since).limit(200),
      supabase.from("ux_navigation_events").select("to_path, from_path, is_bounce, is_exit, scroll_depth_percent, time_on_previous_page_ms, device_type").gte("created_at", since).limit(500),
      supabase.from("ux_search_events").select("query, results_count, created_at").gte("created_at", since).limit(300),
      supabase.from("ux_user_feedback").select("page_path, rating, comment, category, created_at").gte("created_at", since).limit(100),
      supabase.from("ux_performance_metrics").select("metric_type, value_ms, device_type, page_path").gte("created_at", since).limit(300),
      supabase.from("deals").select("id, company, stage, status, created_at, updated_at, deal_type, value").limit(500),
      supabase.from("activity_logs").select("activity_type, description, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
      supabase.from("deal_lenders").select("stage, tracking_status, created_at, updated_at").limit(500),
      // Get previous week's health score from ai_usage_logs metadata
      supabase.from("ai_usage_logs").select("created_at, output_tokens").eq("feature", "ux_insights_email").order("created_at", { ascending: false }).limit(2),
    ]);

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

    // Summarize
    const pageViewSummary: Record<string, number> = {};
    pageViews.forEach((pv: any) => { pageViewSummary[pv.page_path] = (pageViewSummary[pv.page_path] || 0) + 1; });

    const errorSummary: Record<string, number> = {};
    errors.forEach((e: any) => { const k = `${e.error_type}: ${(e.error_message || "unknown").substring(0, 80)}`; errorSummary[k] = (errorSummary[k] || 0) + 1; });

    const failedSearches = searchEvents.filter((s: any) => s.results_count === 0);
    const dealStages: Record<string, number> = {};
    deals.forEach((d: any) => { dealStages[d.stage || "Unknown"] = (dealStages[d.stage || "Unknown"] || 0) + 1; });
    const lenderStages: Record<string, number> = {};
    dealLenders.forEach((dl: any) => { lenderStages[dl.stage || "Unknown"] = (lenderStages[dl.stage || "Unknown"] || 0) + 1; });
    const activityTypes: Record<string, number> = {};
    activityLogs.forEach((a: any) => { activityTypes[a.activity_type] = (activityTypes[a.activity_type] || 0) + 1; });
    const bounces = navigation.filter((n: any) => n.is_bounce).length;
    const exits = navigation.filter((n: any) => n.is_exit).length;
    const perfByType: Record<string, { sum: number; count: number }> = {};
    performance.forEach((p: any) => {
      if (!perfByType[p.metric_type]) perfByType[p.metric_type] = { sum: 0, count: 0 };
      perfByType[p.metric_type].sum += Number(p.value_ms) || 0;
      perfByType[p.metric_type].count++;
    });
    const avgPerf: Record<string, number> = {};
    Object.entries(perfByType).forEach(([k, v]) => { avgPerf[k] = Math.round(v.sum / v.count); });
    const avgRating = feedback.length > 0
      ? (feedback.reduce((s: number, f: any) => s + (f.rating || 0), 0) / feedback.length).toFixed(1)
      : "N/A";

    const dataSummary = {
      period: "Last 30 days",
      hasRealData: pageViews.length > 0 || errors.length > 0 || deals.length > 0 || activityLogs.length > 0,
      pageViews: { total: pageViews.length, uniqueSessions: new Set(pageViews.map((p: any) => p.session_id)).size, byPage: pageViewSummary },
      rageClicks: rageClicks.slice(0, 10).map((r: any) => ({ page: r.page_path, element: r.element_text || r.element_selector, clicks: r.click_count })),
      errors: { total: errors.length, byType: errorSummary },
      navigation: { total: navigation.length, bounceRate: navigation.length > 0 ? ((bounces / navigation.length) * 100).toFixed(1) + "%" : "N/A", exitRate: navigation.length > 0 ? ((exits / navigation.length) * 100).toFixed(1) + "%" : "N/A" },
      search: { total: searchEvents.length, failed: failedSearches.length, failRate: searchEvents.length > 0 ? ((failedSearches.length / searchEvents.length) * 100).toFixed(1) + "%" : "N/A", topFailedQueries: failedSearches.slice(0, 5).map((s: any) => s.query) },
      performance: avgPerf,
      feedback: { count: feedback.length, avgRating },
      deals: { total: deals.length, byStage: dealStages, activeCount: deals.filter((d: any) => d.status === "active").length },
      lenders: { total: dealLenders.length, byStage: lenderStages },
      activityLogs: { total: activityLogs.length, byType: activityTypes },
    };

    // ── 2. Generate AI insights ──
    const systemPrompt = `You are a senior product analytics expert for a B2B deal management / lending platform called "naitive". Analyze the provided user activity data and generate actionable product improvement insights.

Return a JSON object with this structure:
{
  "healthScore": number (0-100, overall UX health),
  "summary": string (2-3 sentence executive summary),
  "insights": [
    {
      "title": string (short, specific),
      "description": string (2-3 sentences with data),
      "recommendation": string (specific action),
      "impact": "high" | "medium" | "low",
      "category": "UX" | "Feature" | "Workflow" | "Performance",
      "relatedDeals": string[] (company names of deals most relevant to this insight, max 3)
    }
  ]
}

Guidelines:
- Generate 5-8 insights, prioritized by impact
- Be specific with numbers when data exists
- For each insight, identify which deals (by company name) are most relevant if applicable
- Recommendations should be concrete and actionable
- If data is sparse, note that and provide best-effort analysis

Return ONLY valid JSON, no markdown wrapping.`;

    const userPrompt = `Here is the platform activity data for analysis:

${JSON.stringify(dataSummary, null, 2)}

Active deals in the platform:
${deals.map((d: any) => `• ${d.company} — Stage: ${d.stage}, Value: $${(d.value || 0).toLocaleString()}, Status: ${d.status || "active"}`).join("\n")}

Generate product improvement insights with related deals where applicable.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content in AI response");

    let parsed: any;
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      parsed = JSON.parse(jsonStr.trim());
    } catch {
      console.error("Failed to parse AI response:", content);
      parsed = {
        healthScore: 70,
        summary: "Analysis completed but response format was unexpected.",
        insights: [{ title: "Review Required", description: content.substring(0, 300), recommendation: "Review the full analysis manually.", impact: "medium", category: "UX", relatedDeals: [] }],
      };
    }

    const { healthScore = 70, summary = "", insights = [] } = parsed;

    // ── 2b. Compute change from last week ──
    // Previous score stored as output_tokens (repurposed field) in ai_usage_logs
    const prevLogs = prevScoreRes.data || [];
    // The most recent entry is the current run (not yet logged), so the previous is index 0 if it exists
    const previousScore = prevLogs.length > 0 ? prevLogs[0].output_tokens : null;
    const scoreDelta = previousScore !== null ? healthScore - previousScore : null;

    // Log this week's score for next week's comparison
    await supabase.from("ai_usage_logs").insert({
      company_id: "00000000-0000-0000-0000-000000000000", // system-level
      user_id: "00000000-0000-0000-0000-000000000000",
      feature: "ux_insights_email",
      model: "gemini-3-flash-preview",
      input_tokens: 0,
      output_tokens: healthScore, // Store health score for week-over-week tracking
      status: "success",
    });

    // ── 3. Build email HTML (dark theme) ──
    const now = new Date();
    const formattedDate = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const healthColor = healthScore >= 80 ? "#22c55e" : healthScore >= 60 ? "#f59e0b" : "#ef4444";
    const healthLabel = healthScore >= 80 ? "Healthy" : healthScore >= 60 ? "Needs Attention" : "Critical";
    const healthGlow = healthScore >= 80 ? "rgba(34,197,94,0.3)" : healthScore >= 60 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)";

    // Delta display
    let deltaHtml = "";
    if (scoreDelta !== null) {
      const deltaColor = scoreDelta > 0 ? "#22c55e" : scoreDelta < 0 ? "#ef4444" : "#94a3b8";
      const deltaArrow = scoreDelta > 0 ? "▲" : scoreDelta < 0 ? "▼" : "●";
      const deltaText = scoreDelta > 0 ? `+${scoreDelta}` : `${scoreDelta}`;
      deltaHtml = `<p style="margin:4px 0 0;font-size:12px;color:${deltaColor};font-weight:600;">${deltaArrow} ${deltaText} from last week</p>`;
    } else {
      deltaHtml = `<p style="margin:4px 0 0;font-size:11px;color:#64748b;">First report — no prior data</p>`;
    }

    const insightRows = insights.map((insight: any) => {
      const impactColor = insight.impact === "high" ? "#ef4444" : insight.impact === "medium" ? "#f59e0b" : "#64748b";
      const impactBg = insight.impact === "high" ? "rgba(239,68,68,0.15)" : insight.impact === "medium" ? "rgba(245,158,11,0.15)" : "rgba(100,116,139,0.15)";
      const categoryColors: Record<string, string> = { UX: "#a78bfa", Performance: "#60a5fa", Workflow: "#34d399", Feature: "#c084fc" };
      const categoryColor = categoryColors[insight.category] || "#a78bfa";

      const dealChips = (insight.relatedDeals || []).map((d: string) =>
        `<span style="display:inline-block;background:rgba(59,130,246,0.15);color:#93c5fd;padding:2px 8px;border-radius:4px;font-size:11px;margin-right:4px;margin-top:4px;">${d}</span>`
      ).join("");

      return `
        <tr>
          <td style="padding:0 0 12px 0;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1e293b;border:1px solid #334155;border-radius:8px;border-left:3px solid ${impactColor};">
              <tr>
                <td style="padding:16px 20px;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td>
                        <span style="display:inline-block;background:${impactBg};color:${impactColor};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;">${insight.impact} impact</span>
                        <span style="display:inline-block;background:rgba(100,116,139,0.2);color:${categoryColor};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;margin-left:6px;">${insight.category}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top:10px;">
                        <p style="margin:0;font-size:15px;font-weight:600;color:#f1f5f9;">${insight.title}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top:6px;">
                        <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">${insight.description}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top:10px;border-top:1px solid #334155;margin-top:8px;">
                        <p style="margin:8px 0 0;font-size:13px;color:#cbd5e1;"><span style="color:#60a5fa;font-weight:600;">→</span> ${insight.recommendation}</p>
                      </td>
                    </tr>
                    ${dealChips ? `
                    <tr>
                      <td style="padding-top:8px;">
                        <p style="margin:0 0 4px;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">RELATED DEALS</p>
                        ${dealChips}
                      </td>
                    </tr>` : ""}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    }).join("");

    const appUrl = "https://fivelinenaitive.lovable.app";

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0f172a;">
    <tr><td align="center" style="padding:32px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%);padding:36px 32px 28px;border-radius:12px 12px 0 0;border:1px solid #1e293b;border-bottom:none;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td>
                  <p style="margin:0;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:1.5px;">WEEKLY UX INSIGHTS</p>
                  <p style="margin:6px 0 0;font-size:24px;font-weight:700;color:#f8fafc;">naitive Platform Health</p>
                  <p style="margin:6px 0 0;font-size:13px;color:#64748b;">${formattedDate}</p>
                </td>
                <td style="text-align:right;vertical-align:top;">
                  <table cellpadding="0" cellspacing="0" border="0" style="display:inline-block;">
                    <tr>
                      <td style="background:rgba(15,23,42,0.8);border:2px solid ${healthColor};border-radius:16px;padding:16px 24px;text-align:center;box-shadow:0 0 20px ${healthGlow};">
                        <p style="margin:0;font-size:36px;font-weight:800;color:${healthColor};line-height:1;">${healthScore}</p>
                        <p style="margin:4px 0 0;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${healthLabel}</p>
                        ${deltaHtml}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Executive Summary -->
        <tr>
          <td style="background:#1e293b;padding:24px 32px;border-left:1px solid #334155;border-right:1px solid #334155;">
            <p style="margin:0;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:1px;">EXECUTIVE SUMMARY</p>
            <p style="margin:10px 0 0;font-size:14px;color:#cbd5e1;line-height:1.7;">${summary}</p>
          </td>
        </tr>

        <!-- Quick Stats -->
        <tr>
          <td style="background:#0f172a;padding:20px 32px;border-left:1px solid #334155;border-right:1px solid #334155;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="25%" style="text-align:center;padding:12px 4px;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1e293b;border-radius:8px;border:1px solid #334155;">
                    <tr><td style="padding:14px 8px;">
                      <p style="margin:0;font-size:24px;font-weight:700;color:#60a5fa;">${dataSummary.deals.total}</p>
                      <p style="margin:4px 0 0;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Total Deals</p>
                    </td></tr>
                  </table>
                </td>
                <td width="25%" style="text-align:center;padding:12px 4px;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1e293b;border-radius:8px;border:1px solid #334155;">
                    <tr><td style="padding:14px 8px;">
                      <p style="margin:0;font-size:24px;font-weight:700;color:#34d399;">${dataSummary.deals.activeCount}</p>
                      <p style="margin:4px 0 0;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Active</p>
                    </td></tr>
                  </table>
                </td>
                <td width="25%" style="text-align:center;padding:12px 4px;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1e293b;border-radius:8px;border:1px solid #334155;">
                    <tr><td style="padding:14px 8px;">
                      <p style="margin:0;font-size:24px;font-weight:700;color:#a78bfa;">${dataSummary.lenders.total}</p>
                      <p style="margin:4px 0 0;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Lenders</p>
                    </td></tr>
                  </table>
                </td>
                <td width="25%" style="text-align:center;padding:12px 4px;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1e293b;border-radius:8px;border:1px solid #334155;">
                    <tr><td style="padding:14px 8px;">
                      <p style="margin:0;font-size:24px;font-weight:700;color:#f59e0b;">${dataSummary.activityLogs.total}</p>
                      <p style="margin:4px 0 0;font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Activities</p>
                    </td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Insights Section -->
        <tr>
          <td style="background:#0f172a;padding:24px 32px 8px;border-left:1px solid #334155;border-right:1px solid #334155;">
            <p style="margin:0;font-size:16px;font-weight:700;color:#f1f5f9;">🔍 Insights & Recommendations</p>
            <p style="margin:4px 0 16px;font-size:13px;color:#64748b;">${insights.length} insight${insights.length !== 1 ? "s" : ""} generated from platform activity</p>
          </td>
        </tr>
        <tr>
          <td style="background:#0f172a;padding:0 32px 24px;border-left:1px solid #334155;border-right:1px solid #334155;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              ${insightRows}
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="background:#1e293b;padding:24px 32px;text-align:center;border-left:1px solid #334155;border-right:1px solid #334155;">
            <a href="${appUrl}/admin" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#2563eb);color:#ffffff;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">View Full UX Recommendations →</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 32px;text-align:center;border-radius:0 0 12px 12px;border:1px solid #1e293b;border-top:none;">
            <p style="margin:0;font-size:11px;color:#475569;"><p style="margin:0;font-size:11px;color:#475569;">This is an automated weekly report from naitive. Delivered every Friday at 6:00 PM ET.</p></p>
            <p style="margin:4px 0 0;font-size:11px;color:#475569;">naitive • <a href="${appUrl}" style="color:#64748b;text-decoration:none;">fivelinenaitive.lovable.app</a></p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // ── 4. Send via Resend ──
    const RECIPIENT = "jturner@5thline.co";
    const subjectDelta = scoreDelta !== null
      ? (scoreDelta > 0 ? ` (▲ +${scoreDelta})` : scoreDelta < 0 ? ` (▼ ${scoreDelta})` : ` (● no change)`)
      : "";
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: "naitive <noreply@updates.naitive.co>",
      to: [RECIPIENT],
      subject: `naitive UX Insights — Health Score: ${healthScore}/100${subjectDelta} — ${formattedDate}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
    } else {
      console.log("UX insights email sent:", emailResult);
    }

    return new Response(JSON.stringify({
      success: true,
      recipient: RECIPIENT,
      healthScore,
      previousScore,
      scoreDelta,
      insightCount: insights.length,
      emailId: emailResult?.id || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-ux-insights-email error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
