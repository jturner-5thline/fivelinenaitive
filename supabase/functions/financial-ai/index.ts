import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Supported actions
type ActionType = 'insights' | 'chart_spec' | 'anomaly_review' | 'financial_qa';

const INSIGHT_SCHEMA = `{
  "executive_summary": "string (2-3 sentences)",
  "positive_trends": [{ "title": "string", "detail": "string", "metric_refs": ["string"] }],
  "risks": [{ "title": "string", "detail": "string", "severity": "high|medium|low", "metric_refs": ["string"] }],
  "growth_observations": "string",
  "margin_observations": "string",
  "liquidity_leverage_observations": "string",
  "debt_servicing_observations": "string",
  "anomalies": [{ "title": "string", "detail": "string", "severity": "critical|warning|info", "period": "string", "metric_key": "string" }],
  "follow_up_questions": ["string"]
}`;

const CHART_SPEC_SCHEMA = `{
  "chart_type": "line|bar|area|combo",
  "title": "string",
  "subtitle": "string (optional)",
  "metric_keys": ["string - keys from deal_computed_metrics"],
  "comparison_keys": ["string (optional)"],
  "x_axis_period_type": "month|quarter|year",
  "default_time_range": "6m|12m|24m|all",
  "y_axis_format": "currency|percentage|multiple|number",
  "narrative_focus": "string (1 sentence explaining what to look for)",
  "confidence": 0.0-1.0,
  "follow_up_questions": ["string"]
}`;

const QA_SCHEMA = `{
  "answer": "string (clear, data-driven response)",
  "cited_metrics": [{ "metric_key": "string", "period": "string", "value": number, "formatted": "string" }],
  "chart_suggestion": null or chart_spec object,
  "confidence": 0.0-1.0,
  "caveats": ["string"],
  "follow_up_questions": ["string"]
}`;

const ANOMALY_SCHEMA = `{
  "data_quality_score": 0-100,
  "issues": [{
    "severity": "critical|warning|info",
    "type": "missing_period|duplicate|sign_convention|broken_subtotal|unusual_swing|classification",
    "title": "string",
    "detail": "string",
    "affected_metric": "string",
    "affected_periods": ["string"],
    "recommendation": "string"
  }],
  "summary": "string"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { action, deal_id, query, chart_request } = await req.json() as {
      action: ActionType;
      deal_id: string;
      query?: string;
      chart_request?: string;
    };

    if (!deal_id || !action) {
      return new Response(JSON.stringify({ error: "deal_id and action are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch deal info
    const { data: deal } = await supabase.from("deals").select("company, company_id").eq("id", deal_id).single();
    const companyName = deal?.company || "Unknown";
    const companyId = deal?.company_id;

    // Fetch computed metrics
    const { data: metricsData } = await supabase
      .from("deal_computed_metrics")
      .select("metric_key, metric_label, category, period_label, value, unit_type, trend_direction, trend_magnitude, is_outlier, is_missing")
      .eq("deal_id", deal_id)
      .order("period_label");

    const metrics = metricsData || [];

    // Build structured context
    const metricsByKey = new Map<string, Array<{ period: string; value: number | null; trend: string | null }>>();
    for (const m of metrics) {
      if (!metricsByKey.has(m.metric_key)) metricsByKey.set(m.metric_key, []);
      metricsByKey.get(m.metric_key)!.push({
        period: m.period_label,
        value: m.value,
        trend: m.trend_direction,
      });
    }

    // Create a concise metrics summary for the prompt
    const summaryLines: string[] = [`Company: ${companyName}`];
    for (const [key, values] of metricsByKey) {
      const latest = values[values.length - 1];
      const label = metrics.find(m => m.metric_key === key)?.metric_label || key;
      const unit = metrics.find(m => m.metric_key === key)?.unit_type || 'number';
      const formatted = formatValue(latest?.value, unit);
      const trend = latest?.trend ? ` (${latest.trend})` : '';
      summaryLines.push(`${label}: ${formatted}${trend}`);

      // Add last 6 periods for trend context
      const recent = values.slice(-6);
      if (recent.length > 1) {
        summaryLines.push(`  Last ${recent.length} periods: ${recent.map(v => formatValue(v.value, unit)).join(', ')}`);
      }
    }

    const metricsContext = summaryLines.join('\n');

    // Available metric keys for chart specs
    const availableMetricKeys = [...new Set(metrics.map(m => m.metric_key))];

    // Build system prompt based on action
    let systemPrompt: string;
    let userPrompt: string;

    switch (action) {
      case 'insights':
        systemPrompt = `You are a senior credit analyst producing structured financial insights.
Analyze the provided precomputed financial metrics and return ONLY valid JSON matching this schema:
${INSIGHT_SCHEMA}

Rules:
- Use ONLY the provided metric values. Do not fabricate data.
- Reference specific periods and values when making observations.
- If data is insufficient for a section, say so explicitly.
- Distinguish between fact, inference, and recommendation.
- Format currency as $XXK or $X.XMM.`;
        userPrompt = `Analyze these financial metrics and produce a structured insight report:\n\n${metricsContext}`;
        break;

      case 'chart_spec':
        systemPrompt = `You are a financial visualization assistant. Given a chart request, produce ONLY valid JSON matching this schema:
${CHART_SPEC_SCHEMA}

Available metric_keys: ${JSON.stringify(availableMetricKeys)}

Rules:
- Only reference metric_keys from the available list above.
- Do NOT invent chart values. The frontend will fetch actual values.
- Choose the chart type that best represents the requested data.
- Provide a clear narrative_focus explaining what the user should look for.`;
        userPrompt = `Chart request: ${chart_request || query || 'Revenue and EBITDA trend'}\n\nAvailable data:\n${metricsContext}`;
        break;

      case 'anomaly_review':
        systemPrompt = `You are a financial data quality analyst. Review the provided metrics for anomalies and return ONLY valid JSON matching this schema:
${ANOMALY_SCHEMA}

Check for:
- Missing periods in time series
- Unusual month-over-month swings (>30%)
- Sign convention inconsistencies
- Metrics that should correlate but don't
- Suspicious zero values where data should exist
- Revenue classification concerns`;
        userPrompt = `Review these financial metrics for data quality issues:\n\n${metricsContext}`;
        break;

      case 'financial_qa':
        systemPrompt = `You are a senior financial analyst answering questions about a company's financial performance.
Return ONLY valid JSON matching this schema:
${QA_SCHEMA}

Available metric_keys for chart suggestions: ${JSON.stringify(availableMetricKeys)}

Rules:
- Base answers ONLY on the provided precomputed metrics.
- Cite specific metric values and periods.
- If asked about data you don't have, say so clearly.
- Suggest a chart when visual representation would help.
- Distinguish between fact and inference.
- Use financial terminology appropriate for credit underwriting.`;
        userPrompt = `Question: ${query}\n\nFinancial data:\n${metricsContext}`;
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Call AI gateway
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4096,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || '{}';

    // Parse and validate JSON
    let structured: any;
    try {
      structured = JSON.parse(rawContent);
    } catch {
      // Try extracting JSON from markdown code block
      const match = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        structured = JSON.parse(match[1]);
      } else {
        structured = { error: "Failed to parse AI response", raw: rawContent.slice(0, 500) };
      }
    }

    // Cache insights and anomaly reviews
    if (action === 'insights' || action === 'anomaly_review') {
      const inputHash = simpleHash(metricsContext);
      await supabase.from("deal_financial_insights").upsert({
        deal_id,
        company_id: companyId,
        insight_type: action,
        structured_output: structured,
        model_used: 'google/gemini-2.5-flash',
        user_id: user.id,
        input_hash: inputHash,
        is_stale: false,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any, { onConflict: 'deal_id,insight_type' } as any);
    }

    // Log usage
    if (companyId) {
      try {
        await supabase.from("ai_usage_logs").insert({
          company_id: companyId,
          user_id: user.id,
          feature: `financial_${action}`,
          model: 'google/gemini-2.5-flash',
          input_tokens: aiResult.usage?.prompt_tokens || 0,
          output_tokens: aiResult.usage?.completion_tokens || 0,
          status: 'success',
        });
      } catch { /* best effort */ }
    }

    return new Response(JSON.stringify({
      success: true,
      action,
      data: structured,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("financial-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function formatValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return 'N/A';
  switch (unit) {
    case 'currency': {
      const abs = Math.abs(value);
      const sign = value < 0 ? '-' : '';
      if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}MM`;
      if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
      return `${sign}$${abs.toFixed(0)}`;
    }
    case 'percentage': return `${value.toFixed(1)}%`;
    case 'multiple': case 'ratio': return `${value.toFixed(2)}x`;
    default: return value.toFixed(1);
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}
