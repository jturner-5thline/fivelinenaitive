import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { modelData, insightType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build a focused data snapshot for the AI
    const metrics = modelData || {};
    const dataSnapshot = `
Company: ${metrics.settings?.companyName || 'Unknown'}
Business Model: ${metrics.settings?.businessModel || 'SaaS'}
ARR Today: $${((metrics.arrToday || 0) / 1000).toFixed(0)}K
MRR (T3M avg): $${((metrics.mrrT3M || 0) / 1000).toFixed(0)}K
Latest Gross Margin: ${(metrics.latestGrossMargin || 0).toFixed(1)}%
YoY Revenue Growth: ${(metrics.yoyRevGrowth || 0).toFixed(1)}%
Net Revenue Retention: ${(metrics.netRevenueRetention || 0).toFixed(1)}%
Borrowing Capacity: $${((metrics.borrowingCapacity || 0) / 1000).toFixed(0)}K
Facility Recommendation: $${((metrics.facilityRecommendation || 0) / 1000).toFixed(0)}K
Current Ratio: ${(metrics.currentRatio || 0).toFixed(2)}x
AR/AP Ratio: ${(metrics.arApRatio || 0).toFixed(2)}x
Cash/Total Assets: ${(metrics.cashTotalAssets || 0).toFixed(1)}%
Debt/Total Liabilities: ${(metrics.debtTotalLiabilities || 0).toFixed(1)}%

Revenue (last 12 months): ${(metrics.totalRevenue || []).slice(-12).map((v: number) => `$${(v / 1000).toFixed(0)}K`).join(', ')}
EBITDA (last 12 months): ${(metrics.ebitda || []).slice(-12).map((v: number) => `$${(v / 1000).toFixed(0)}K`).join(', ')}
Gross Profit (last 12 months): ${(metrics.grossProfit || []).slice(-12).map((v: number) => `$${(v / 1000).toFixed(0)}K`).join(', ')}
Net Income (last 12 months): ${(metrics.netIncome || []).slice(-12).map((v: number) => `$${(v / 1000).toFixed(0)}K`).join(', ')}
Operating Income (last 12 months): ${(metrics.operatingIncome || []).slice(-12).map((v: number) => `$${(v / 1000).toFixed(0)}K`).join(', ')}
Operating Margin % (last 12 months): ${(metrics.operatingMarginPct || []).slice(-12).map((v: number) => `${v.toFixed(1)}%`).join(', ')}
Gross Margin % (last 12 months): ${(metrics.grossMarginPct || []).slice(-12).map((v: number) => `${v.toFixed(1)}%`).join(', ')}
`;

    let systemPrompt = '';

    if (insightType === 'trends') {
      systemPrompt = `You are a senior credit analyst generating a concise financial trends narrative. Analyze the data and produce a structured report with these sections:

1. **Revenue Trajectory** — Growth trend, seasonality, recurring vs non-recurring mix
2. **Profitability Analysis** — Gross margin trend, operating leverage, EBITDA trajectory
3. **Key Strengths** — 2-3 bullet points of positive signals
4. **Risk Flags** — 2-3 bullet points of concerns or anomalies
5. **Credit Outlook** — 1-2 sentence summary of lending risk posture

Format numbers as $XXK or $X.XMM. Be specific and data-driven. Keep total output under 400 words.`;
    } else if (insightType === 'anomalies') {
      systemPrompt = `You are a financial anomaly detection system. Scan the data for:

1. **Month-over-Month Spikes** — Any metric with >20% swing
2. **Trend Breaks** — Reversals in previously stable trends
3. **Ratio Anomalies** — Unusual current ratio, AR/AP, or leverage
4. **Margin Compression** — Gross or operating margin deterioration
5. **Cash Flow Warnings** — Signs of cash burn acceleration

For each anomaly found, output:
- 🔴 Critical / 🟡 Watch / 🟢 Informational
- The specific metric and period
- What it means for credit risk

If no anomalies found, say so clearly. Be concise, max 300 words.`;
    } else if (insightType === 'underwriting') {
      systemPrompt = `You are drafting an internal underwriting note for a private credit deal. Structure as:

## Executive Summary
One paragraph overview of the borrower's financial profile and credit worthiness.

## Financial Highlights
| Metric | Value | Assessment |
|--------|-------|------------|
(Include ARR, Growth, Gross Margin, EBITDA, Current Ratio, NRR)

## Borrowing Base Analysis
- Recommended facility size and rationale
- Collateral coverage assessment
- Covenant suggestions (Revenue, EBITDA, Liquidity)

## Risk Factors
Numbered list of 3-5 key risks with mitigation notes.

## Recommendation
Clear approve/decline/conditional recommendation with conditions.

Keep it professional, concise, and under 500 words. Use markdown tables where appropriate.`;
    } else {
      systemPrompt = `You are a financial analysis assistant. Provide a brief, data-driven summary of this company's financial health for credit underwriting purposes. Keep it under 200 words.`;
    }

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
          { role: "user", content: `Analyze this financial data:\n\n${dataSnapshot}` },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits to continue." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("analysis-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
