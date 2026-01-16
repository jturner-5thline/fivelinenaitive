import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { deals, lenders } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Prepare deal summary for AI analysis
    const dealSummary = deals.map((deal: any) => ({
      company: deal.company,
      value: deal.value,
      stage: deal.stage,
      status: deal.status,
      dealType: deal.deal_type,
      isFlagged: deal.is_flagged,
      createdAt: deal.created_at,
      updatedAt: deal.updated_at,
      lenderCount: deal.lenderCount || 0,
    }));

    const systemPrompt = `You are an expert financial advisor and deal analyst. Analyze the provided deal pipeline data and generate actionable insights and recommendations.

Your analysis should include:
1. **Pipeline Health**: Overall assessment of the deal pipeline
2. **Risk Alerts**: Identify deals that may need attention (stale, flagged, stuck in stages)
3. **Opportunities**: Highlight promising deals and potential quick wins
4. **Recommendations**: 3-5 specific, actionable recommendations to improve deal outcomes
5. **Trends**: Any patterns you notice in the data

Format your response as JSON with this structure:
{
  "pipelineHealth": {
    "score": number (1-100),
    "summary": string,
    "metrics": { "totalValue": number, "activeDeals": number, "avgDealSize": number }
  },
  "riskAlerts": [{ "dealName": string, "issue": string, "priority": "high" | "medium" | "low", "recommendation": string }],
  "opportunities": [{ "dealName": string, "opportunity": string, "potentialValue": number }],
  "recommendations": [{ "title": string, "description": string, "impact": "high" | "medium" | "low" }],
  "trends": [{ "trend": string, "insight": string }]
}`;

    const userPrompt = `Analyze this deal pipeline data and provide insights:

Total Deals: ${dealSummary.length}
Total Lenders: ${lenders?.length || 0}

Deal Data:
${JSON.stringify(dealSummary, null, 2)}

Provide comprehensive insights and actionable recommendations based on this data.`;

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

    // Parse the JSON response from AI
    let insights;
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      insights = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", content);
      // Return a structured fallback
      insights = {
        pipelineHealth: {
          score: 70,
          summary: content.substring(0, 200),
          metrics: { totalValue: 0, activeDeals: dealSummary.length, avgDealSize: 0 }
        },
        riskAlerts: [],
        opportunities: [],
        recommendations: [{ title: "Review Pipeline", description: content, impact: "medium" }],
        trends: []
      };
    }

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-insights error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
