import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { action, context } = await req.json();

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "variance_scan") {
      systemPrompt = `You are an expert FP&A analyst AI. Analyze financial variance data and provide clear, actionable explanations.

RULES:
- Always attribute variances to specific vendors, departments, or categories
- Use exact dollar amounts with (+$X) for increases and (−$X) for decreases
- Include percentage changes where relevant
- Structure explanations as: main drivers first, then offsets
- Flag anomalies and one-time items explicitly
- Provide confidence scores (0.0-1.0) for each finding
- Show your work: list the intermediate calculations

Respond with valid JSON matching this structure:
{
  "findings": [
    {
      "metric": "string",
      "variance": number,
      "variancePct": number,
      "direction": "favorable" | "unfavorable",
      "explanation": "string with attribution",
      "confidence": number,
      "drilldowns": [
        {
          "dimension": "string",
          "items": [{"name": "string", "amount": number}]
        }
      ],
      "workSteps": [
        "step 1 description",
        "step 2 description"
      ],
      "sourceRecords": number,
      "anomalyFlag": boolean
    }
  ],
  "summary": "one paragraph executive summary",
  "totalVariance": number,
  "periodComparison": "string"
}`;

      userPrompt = `Analyze the following financial data for variance between periods.

Context:
- Company: ${context?.companyName || "Demo Corp"}
- Comparison: ${context?.comparison || "Jan 2025 vs Dec 2024"}
- Threshold: variances > ${context?.thresholdPct || 10}% AND > $${context?.thresholdAmt || 50000}

Financial Data:
${context?.financialData || `
Revenue: Jan $9,500K vs Dec $8,940K
  Product Revenue: Jan $6,800K vs Dec $6,300K
  Service Revenue: Jan $2,700K vs Dec $2,640K
COGS: Jan $2,850K vs Dec $3,280K
  Materials: Jan $1,200K vs Dec $1,450K
  Labor: Jan $950K vs Dec $1,100K
  Other: Jan $700K vs Dec $730K
Gross Profit: Jan $6,650K vs Dec $5,660K
S&M: Jan $2,100K vs Dec $2,000K
  Digital Ads: Jan $865K vs Dec $800K
  Events: Jan $435K vs Dec $400K
  Headcount: Jan $800K vs Dec $800K
R&D: Jan $2,400K vs Dec $2,340K
G&A: Jan $950K vs Dec $1,000K
EBITDA: Jan $1,200K vs Dec $320K

Top Vendors by Change:
- Catalyst Growth Partners: −$176K (materials contract renegotiation)
- Delta Strategic Solutions: −$91K (project completion)
- FreshPath Consulting: +$68K (new engagement)
- NovaTech Digital: +$65K (Q4 campaign extension)
- Summit Events Co: +$35K (trade show sponsorship)

Geography breakdown:
- United States: −$67.7K net change
- EMEA: +$23K
- APAC: +$12K
`}

Provide detailed variance analysis with attribution.`;

    } else if (action === "explore") {
      systemPrompt = `You are an AI pivot table builder for FP&A. Given a natural language query about financial data, generate a structured table.

Respond with valid JSON:
{
  "title": "string",
  "headers": ["column1", "column2", ...],
  "rows": [["val1", "val2", ...], ...],
  "rowDimension": "string",
  "colDimension": "string",
  "insights": ["insight 1", "insight 2"],
  "suggestedFollowups": ["query 1", "query 2"]
}

Format currency as $XK or $XM. Include variance columns ($ and %) when comparing periods. Bold totals by NOT indenting them. Indent sub-items with two spaces.`;

      userPrompt = context?.query || "Show me Nov vs Dec 2024 P&L by account with $ and % MoM differences";

    } else if (action === "sql") {
      systemPrompt = `You are a SQL expert for financial data warehouses. Convert natural language to SQL.

Available tables:
- financial_data (id, company_id, period_id, line_item_id, amount, notes)
- financial_periods (id, company_id, period_type, year, month, quarter, start_date, end_date)
- financial_line_items (id, company_id, category_id, statement_type, name, display_order, is_calculated)
- financial_line_item_categories (id, company_id, statement_type, name, display_order)

Respond with valid JSON:
{
  "sql": "the SQL query",
  "explanation": "what this query does in plain language",
  "tables_used": ["table1", "table2"],
  "complexity": "simple" | "moderate" | "complex",
  "warnings": ["any caveats or assumptions"]
}`;

      userPrompt = context?.query || "Create a UNION ALL query combining Actuals and Budget";
    } else {
      throw new Error(`Unknown action: ${action}`);
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
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    // Parse JSON from response (handle markdown code blocks)
    let parsed;
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      // If JSON parsing fails, return raw content
      parsed = { raw: content };
    }

    return new Response(JSON.stringify({ success: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("FPA AI error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
