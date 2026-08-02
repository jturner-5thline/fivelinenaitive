import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface RowLabel {
  rowIdx: number;
  label: string;
  sampleValues: (string | number | null)[];
}

interface MappingSuggestion {
  rowIdx: number;
  label: string;
  suggestedField: string;
  confidence: number;
  reason: string;
  category: "is" | "bs" | "checklist";
}

/**
 * Compute simple numeric stats for recurring-revenue detection.
 * Returns null when there are fewer than 3 numeric values.
 */
function computeRowStats(values: (string | number | null)[]) {
  const nums = values
    .map((v) => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(/[,$]/g, "")) : NaN))
    .filter((n) => !isNaN(n));

  if (nums.length < 3) return null;

  const nonZero = nums.filter((n) => n !== 0);
  const presenceRatio = nonZero.length / nums.length;
  const mean = nonZero.reduce((a, b) => a + b, 0) / (nonZero.length || 1);
  if (mean === 0) return null;

  // Coefficient of variation (CV) – lower = more stable
  const variance = nonZero.reduce((s, v) => s + (v - mean) ** 2, 0) / (nonZero.length || 1);
  const cv = Math.sqrt(variance) / Math.abs(mean);

  // Max month-over-month swing as fraction of mean
  let maxSwing = 0;
  for (let i = 1; i < nonZero.length; i++) {
    const swing = Math.abs(nonZero[i] - nonZero[i - 1]) / Math.abs(mean);
    if (swing > maxSwing) maxSwing = swing;
  }

  return { presenceRatio, cv, maxSwing, monthCount: nums.length, nonZeroCount: nonZero.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { rows, company_id, deal_id, checklist_items, statement_type } = await req.json() as {
      rows: RowLabel[];
      company_id: string;
      deal_id?: string;
      checklist_items?: { id: string; name: string; category: string }[];
      statement_type?: 'income-statement' | 'balance-sheet' | 'both';
    };

    if (!rows?.length || !company_id) throw new Error("Missing rows or company_id");

    const stmtType = statement_type || 'both';

    // Fetch historical patterns
    const { data: patterns } = await serviceClient
      .from("mapping_patterns")
      .select("source_label_normalized, mapped_field, action, occurrence_count")
      .eq("company_id", company_id)
      .eq("action", "accepted")
      .order("occurrence_count", { ascending: false })
      .limit(200);

    const patternContext = (patterns || [])
      .map((p: any) => `"${p.source_label_normalized}" → "${p.mapped_field}" (used ${p.occurrence_count}x)`)
      .join("\n");

    // Pre-compute numeric trend stats per row for the prompt
    const trendAnalyses: string[] = [];
    for (const r of rows.slice(0, 100)) {
      const stats = computeRowStats(r.sampleValues);
      if (stats) {
        trendAnalyses.push(
          `Row ${r.rowIdx} "${r.label}": presence=${(stats.presenceRatio * 100).toFixed(0)}% months, CV=${stats.cv.toFixed(2)}, maxSwing=${stats.maxSwing.toFixed(2)}, nonZeroMonths=${stats.nonZeroCount}/${stats.monthCount}`
        );
      }
    }

    const financialFields = [
      "Recurring Revenue", "Non-Recurring Revenue", "Other Revenue",
      "COGS on Recurring Revenue", "COGS on Non-Recurring Revenue", "COGS - Labor",
      "Salaries and Benefits", "Sales and Marketing", "Research and Development",
      "Professional Fees", "General and Administrative",
      "Interest Expense", "Interest Income", "Depreciation Expense", "Other Expense", "Tax Expense",
      "Cash and Cash Equivalents", "Marketable Securities", "Accounts Receivable",
      "Prepaid Expenses", "Inventory", "Other Current Assets",
      "Property Plant & Equipment", "Fixed Assets", "Capitalized Software",
      "Intangible Assets", "Other LT Assets",
      "Accounts Payable", "Credit Cards", "Employee Accruals",
      "Other Accrued Liabilities", "Short-Term Debt", "Deferred Revenue",
      "Other Short-Term Liabilities", "Long-Term Debt", "Government Loan",
      "Shareholder Loan", "Convertible Notes", "Paid in Capital", "Retained Earnings",
    ];

    const checklistContext = checklist_items?.length
      ? `\n\nChecklist items available:\n${checklist_items.map(c => `- "${c.name}" (category: ${c.category})`).join("\n")}`
      : "";

    const rowsText = rows.slice(0, 100).map(r =>
      `Row ${r.rowIdx}: "${r.label}" | sample values: ${r.sampleValues.slice(0, 12).join(", ")}`
    ).join("\n");

    const trendContext = trendAnalyses.length
      ? `\n\nPre-computed monthly trend statistics for revenue rows (use these to classify Recurring vs Non-Recurring Revenue):\n${trendAnalyses.join("\n")}`
      : "";

    const stmtTypeInstruction = stmtType === 'income-statement'
      ? '\n\nIMPORTANT: Only suggest Income Statement mappings (category "is"). Do NOT suggest Balance Sheet mappings.'
      : stmtType === 'balance-sheet'
      ? '\n\nIMPORTANT: Only suggest Balance Sheet mappings (category "bs"). Do NOT suggest Income Statement mappings.'
      : '';

    const systemPrompt = `You are a financial data mapping expert. Given rows from an Excel spreadsheet, suggest which standard financial field each row maps to.${stmtTypeInstruction}

Available financial fields:
${financialFields.join(", ")}
${checklistContext}

${patternContext ? `\nHistorical accepted mappings for this organization (prioritize these patterns):\n${patternContext}` : ""}
${trendContext}

Rules:
- Only suggest mappings you're confident about (>0.5 confidence)
- Skip header rows, total rows, and blank rows
- Use the row label and sample values to determine the mapping
- For rows that are subtotals (e.g. "Total Revenue", "Gross Profit"), do NOT map them
- Confidence: 0.9+ for exact matches, 0.7-0.9 for strong keyword matches, 0.5-0.7 for contextual inference
- category: "is" for income statement, "bs" for balance sheet, "checklist" for checklist items

Keyword-to-field rules (apply with high confidence 0.85+):
- Rows containing "SaaS", "Subscription", "Recurring", "Licensing", or "Software" in the label should map to "Recurring Revenue"
- These keywords strongly indicate recurring revenue streams even if the label is not an exact match

## RECURRING REVENUE DETECTION (critical — use both label cues AND numeric patterns)

For every revenue-category row, determine whether it is Recurring Revenue or Non-Recurring Revenue by combining:

A) Label/naming signals:
   - STRONGER recurring signals: subscription, MRR, ARR, recurring, SaaS, platform fees, retainer, managed services, licensing, maintenance, support contract
   - STRONGER non-recurring signals: project, implementation, one-time, setup, pass-through, consulting, advisory, other income, professional services, installation

B) Monthly numeric pattern (use the pre-computed trend stats):
   - LIKELY RECURRING when:
     • presence ratio >= 75% (appears in most months)
     • coefficient of variation (CV) <= 0.35 (low volatility)
     • max month-over-month swing <= 0.50 (no dramatic spikes)
     • Values show a steady run-rate or gradual growth trend
   - LIKELY NON-RECURRING when:
     • presence ratio < 50% (intermittent/sporadic)
     • CV > 0.60 (high volatility)
     • max swing > 0.80 (large spikes/dips)
     • Values appear concentrated in a few months

C) Combined decision framework:
   - Strong label signal + consistent pattern → Recurring Revenue, confidence 0.85-0.95
   - Neutral label + very consistent pattern (CV<0.25, presence>85%) → Recurring Revenue, confidence 0.75-0.85, explain that pattern suggests recurring
   - Neutral label + moderately consistent (CV 0.25-0.40) → Recurring Revenue, confidence 0.60-0.75, note user review recommended
   - Neutral label + inconsistent pattern → Non-Recurring Revenue or Other Revenue, confidence 0.60-0.75
   - Non-recurring label signal + any pattern → Non-Recurring Revenue, confidence 0.80+
   - Ambiguous cases → suggest with lower confidence (0.50-0.65) and explicitly state the uncertainty

D) Reasoning requirements:
   - For Recurring Revenue suggestions driven by numeric consistency, the reason MUST mention the pattern, e.g.: "Revenue appears consistently each month with limited volatility (CV=0.18, present in 11/12 months), suggesting an ongoing recurring stream."
   - For lower-confidence cases: "Revenue is present monthly but shows elevated volatility (CV=0.42), so user review is recommended."
   - For Non-Recurring: "Revenue appears in only 4/12 months with large variance, consistent with project-based or one-time income."

You MUST use the suggest_mappings tool to return your results.`;

    const userPrompt = `Analyze these rows and suggest mappings:\n\n${rowsText}`;

    const aiResponse = await anthropicFetch({ feature: "ai-mapping-suggest" }, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        tools: [
          {
            name: "suggest_mappings",
            description: "Return mapping suggestions for Excel rows to standard financial fields",
            input_schema: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      rowIdx: { type: "number", description: "The row index from the input" },
                      label: { type: "string", description: "The row label" },
                      suggestedField: { type: "string", description: "The standard field name to map to" },
                      confidence: { type: "number", description: "Confidence score 0-1" },
                      reason: { type: "string", description: "Brief reason for the suggestion, including numeric pattern analysis for revenue rows" },
                      category: { type: "string", enum: ["is", "bs", "checklist"] },
                    },
                    required: ["rowIdx", "label", "suggestedField", "confidence", "reason", "category"],
                  },
                },
              },
              required: ["suggestions"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "suggest_mappings" },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const body = await aiResponse.text();
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("Claude API error:", status, body);
      throw new Error(`Claude API error: ${status}`);
    }

    const aiData = await aiResponse.json();

    let suggestions: MappingSuggestion[] = [];
    const toolUseBlock = aiData.content?.find((block: any) => block.type === "tool_use" && block.name === "suggest_mappings");

    if (toolUseBlock?.input?.suggestions) {
      suggestions = toolUseBlock.input.suggestions;
    }

    suggestions = suggestions.filter(s => s.confidence >= 0.5);

    // Filter by statement type
    if (stmtType === 'income-statement') {
      suggestions = suggestions.filter(s => s.category === 'is');
    } else if (stmtType === 'balance-sheet') {
      suggestions = suggestions.filter(s => s.category === 'bs');
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-mapping-suggest error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
