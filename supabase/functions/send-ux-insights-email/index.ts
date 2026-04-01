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
    // Auth: accept CRON_SECRET or service-role JWT
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const isCron = authHeader === `Bearer ${cronSecret}`;

    if (!isCron) {
      // Also allow manual trigger with valid user auth
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
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

    // ── 1. Gather platform data (same as generate-ux-insights) ──
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const since = thirtyDaysAgo.toISOString();

    const [
      pageViewsRes, rageClicksRes, errorsRes, navigationRes,
      searchEventsRes, feedbackRes, performanceRes,
      dealsRes, activityLogsRes, dealLendersRes,
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

    // ── 3. Build email HTML ──
    const now = new Date();
    const formattedDate = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    const healthColor = healthScore >= 80 ? "#16a34a" : healthScore >= 60 ? "#d97706" : "#dc2626";
    const healthLabel = healthScore >= 80 ? "Healthy" : healthScore >= 60 ? "Needs Attention" : "Critical";

    const insightRows = insights.map((insight: any, i: number) => {
      const impactColor = insight.impact === "high" ? "#dc2626" : insight.impact === "medium" ? "#d97706" : "#6b7280";
      const impactBg = insight.impact === "high" ? "#fef2f2" : insight.impact === "medium" ? "#fffbeb" : "#f9fafb";
      const categoryColor = insight.category === "UX" ? "#7c3aed" : insight.category === "Performance" ? "#2563eb" : insight.category === "Workflow" ? "#059669" : "#8b5cf6";

      const dealChips = (insight.relatedDeals || []).map((d: string) =>
        `<span style="display:inline-block;background:#f0f9ff;color:#0369a1;padding:2px 8px;border-radius:4px;font-size:11px;margin-right:4px;margin-top:4px;">${d}</span>`
      ).join("");

      return `
        <tr>
          <td style="padding:0 0 16px 0;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;border-left:4px solid ${impactColor};">
              <tr>
                <td style="padding:16px 20px;">
                  <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td>
                        <span style="display:inline-block;background:${impactBg};color:${impactColor};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;">${insight.impact} impact</span>
                        <span style="display:inline-block;background:#f3f4f6;color:${categoryColor};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:500;margin-left:6px;">${insight.category}</span>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top:8px;">
                        <p style="margin:0;font-size:15px;font-weight:600;color:#111827;">${insight.title}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top:6px;">
                        <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.5;">${insight.description}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding-top:10px;border-top:1px solid #f3f4f6;margin-top:8px;">
                        <p style="margin:8px 0 0;font-size:13px;color:#111827;"><strong>Recommendation:</strong> ${insight.recommendation}</p>
                      </td>
                    </tr>
                    ${dealChips ? `
                    <tr>
                      <td style="padding-top:8px;">
                        <p style="margin:0 0 4px;font-size:11px;color:#6b7280;font-weight:500;">RELATED DEALS</p>
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

    // Deal pipeline summary
    const stageLabels: Record<string, string> = {
      "proposal-in-development": "Proposal In Development",
      "proposal-issued": "Proposal Issued",
      "nda-ca-stage": "NDA/CA",
      "nda_materials_stage": "NDA / Needs List Sent",
      "submitted-to-lenders": "Submitted to Lenders",
      "lenders-in-review": "Lenders In Review",
      "lender-diligence": "Lender Diligence",
      "terms-issued": "Terms Issued",
      "agreement-pending": "Agreement Pending",
      "closing": "Closing",
      "funded": "Funded",
      "on-hold": "On Hold",
      "closed-lost": "Closed Lost",
      "archived": "Archived",
    };

    const dealSummaryRows = Object.entries(dealStages)
      .filter(([stage]) => !["on-hold", "closed-lost", "archived"].includes(stage))
      .map(([stage, count]) => {
        const label = stageLabels[stage] || stage.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        return `<tr><td style="padding:4px 0;font-size:13px;color:#4b5563;">${label}</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:600;text-align:right;">${count}</td></tr>`;
      }).join("");

    const appUrl = "https://fivelinenaitive.lovable.app";

    const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f4f6;">
    <tr><td align="center" style="padding:32px 16px;">
      <table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px 32px 24px;border-radius:12px 12px 0 0;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td>
                  <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.7);font-weight:500;text-transform:uppercase;letter-spacing:1px;">WEEKLY UX INSIGHTS</p>
                  <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#ffffff;">naitive Platform Health</p>
                  <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">${formattedDate}</p>
                </td>
                <td style="text-align:right;vertical-align:top;">
                  <table cellpadding="0" cellspacing="0" border="0" style="display:inline-block;">
                    <tr>
                      <td style="background:rgba(255,255,255,0.15);border-radius:12px;padding:12px 20px;text-align:center;">
                        <p style="margin:0;font-size:32px;font-weight:800;color:${healthColor};">${healthScore}</p>
                        <p style="margin:2px 0 0;font-size:11px;color:rgba(255,255,255,0.9);font-weight:500;">${healthLabel}</p>
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
          <td style="background:#ffffff;padding:24px 32px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">EXECUTIVE SUMMARY</p>
            <p style="margin:8px 0 0;font-size:14px;color:#374151;line-height:1.6;">${summary}</p>
          </td>
        </tr>

        <!-- Quick Stats -->
        <tr>
          <td style="background:#ffffff;padding:16px 32px 20px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="25%" style="text-align:center;padding:8px;">
                  <p style="margin:0;font-size:22px;font-weight:700;color:#2563eb;">${dataSummary.deals.total}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Total Deals</p>
                </td>
                <td width="25%" style="text-align:center;padding:8px;">
                  <p style="margin:0;font-size:22px;font-weight:700;color:#059669;">${dataSummary.deals.activeCount}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Active Deals</p>
                </td>
                <td width="25%" style="text-align:center;padding:8px;">
                  <p style="margin:0;font-size:22px;font-weight:700;color:#7c3aed;">${dataSummary.lenders.total}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Lender Entries</p>
                </td>
                <td width="25%" style="text-align:center;padding:8px;">
                  <p style="margin:0;font-size:22px;font-weight:700;color:#d97706;">${dataSummary.activityLogs.total}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Activities (30d)</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Insights Section -->
        <tr>
          <td style="background:#f9fafb;padding:24px 32px 8px;">
            <p style="margin:0;font-size:16px;font-weight:700;color:#111827;">🔍 Insights & Recommendations</p>
            <p style="margin:4px 0 16px;font-size:13px;color:#6b7280;">${insights.length} insight${insights.length !== 1 ? "s" : ""} generated from platform activity</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:0 32px 24px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              ${insightRows}
            </table>
          </td>
        </tr>

        <!-- Deal Pipeline Summary -->
        ${dealSummaryRows ? `
        <tr>
          <td style="background:#ffffff;padding:24px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#111827;">📊 Deal Pipeline Snapshot</p>
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              ${dealSummaryRows}
            </table>
          </td>
        </tr>` : ""}

        <!-- CTA -->
        <tr>
          <td style="background:#ffffff;padding:20px 32px 28px;text-align:center;border-top:1px solid #f3f4f6;">
            <a href="${appUrl}/admin" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">View Full UX Recommendations →</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;text-align:center;border-radius:0 0 12px 12px;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">This is an automated weekly report from naitive. Delivered every Friday at 3:00 PM ET.</p>
            <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">naitive • <a href="${appUrl}" style="color:#6b7280;">fivelinenaitive.lovable.app</a></p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // ── 4. Send via Resend ──
    const RECIPIENT = "jturner@5thline.co";
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: "naitive <noreply@updates.naitive.co>",
      to: [RECIPIENT],
      subject: `naitive UX Insights — Health Score: ${healthScore}/100 — ${formattedDate}`,
      html: emailHtml,
    });

    if (emailError) {
      console.error("Resend error:", emailError);
      // Best-effort: don't fail the function
    } else {
      console.log("UX insights email sent:", emailResult);
    }

    return new Response(JSON.stringify({
      success: true,
      recipient: RECIPIENT,
      healthScore,
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
