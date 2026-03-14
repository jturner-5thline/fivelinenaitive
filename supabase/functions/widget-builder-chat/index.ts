import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AVAILABLE_FIELDS = [
  { id: 'f-amount', name: 'Amount', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
  { id: 'f-budget', name: 'Budget', group: 'Financials', dataType: 'number', isMeasure: true, source: 'naitive' },
  { id: 'f-variance', name: 'Variance', group: 'Financials', dataType: 'number', isMeasure: true, source: 'naitive' },
  { id: 'f-revenue', name: 'Revenue', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
  { id: 'f-cogs', name: 'COGS', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
  { id: 'f-expenses', name: 'Expenses', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
  { id: 'f-net-income', name: 'Net Income', group: 'Financials', dataType: 'number', isMeasure: true, source: 'quickbooks' },
  { id: 'f-deal-amount', name: 'Deal Amount', group: 'Financials', dataType: 'number', isMeasure: true, source: 'hubspot' },
  { id: 'f-pipeline-val', name: 'Pipeline Value', group: 'Financials', dataType: 'number', isMeasure: true, source: 'hubspot' },
  { id: 'f-win-rate', name: 'Win Rate', group: 'Financials', dataType: 'number', isMeasure: true, source: 'hubspot' },
  { id: 'a-full', name: 'Account Full', group: 'AccountDim', dataType: 'string', isMeasure: false, source: 'quickbooks' },
  { id: 'a-parent', name: 'Account Parent', group: 'AccountDim', dataType: 'string', isMeasure: false, source: 'quickbooks' },
  { id: 'a-type', name: 'Account Type', group: 'AccountDim', dataType: 'string', isMeasure: false, source: 'quickbooks' },
  { id: 'd-report', name: 'Reporting Month', group: 'DateDim', dataType: 'date', isMeasure: false, source: 'naitive' },
  { id: 'd-fiscal', name: 'Fiscal Quarter', group: 'DateDim', dataType: 'date', isMeasure: false, source: 'naitive' },
  { id: 'd-year', name: 'Fiscal Year', group: 'DateDim', dataType: 'date', isMeasure: false, source: 'naitive' },
  { id: 'g-deal-stage', name: 'Deal Stage', group: 'General', dataType: 'string', isMeasure: false, source: 'hubspot' },
  { id: 'g-deal-owner', name: 'Deal Owner', group: 'General', dataType: 'string', isMeasure: false, source: 'hubspot' },
  { id: 'g-dept', name: 'Department', group: 'General', dataType: 'string', isMeasure: false, source: 'naitive' },
  { id: 'g-entity', name: 'Entity', group: 'General', dataType: 'string', isMeasure: false, source: 'naitive' },
  { id: 'g-region', name: 'Region', group: 'General', dataType: 'string', isMeasure: false, source: 'naitive' },
  { id: 's-created', name: 'Created Date', group: 'System', dataType: 'date', isMeasure: false, source: 'naitive' },
  { id: 's-user', name: 'Created By', group: 'System', dataType: 'string', isMeasure: false, source: 'naitive' },
];

const SOURCE_ABBR: Record<string, string> = { quickbooks: 'QB', hubspot: 'HS', naitive: 'NT' };
const FIELD_REFERENCE = AVAILABLE_FIELDS.map(f => `- ${f.id}: "${f.name}" [${SOURCE_ABBR[f.source]}] (${f.group}, ${f.dataType}, ${f.isMeasure ? 'measure' : 'dimension'})`).join('\n');

const SYSTEM_PROMPT = `You are nAItive's Widget Builder AI. You help users build data visualization widgets by understanding what they want to see and configuring the widget accordingly.

## Available Fields
${FIELD_REFERENCE}

## Widget Configuration
A widget has:
- **name**: Display name
- **type**: "table", "bar", "line", "column", "columnChart", or "kpi"
- **xAxis**: { fieldId, grain (day/month/quarter/year), window (last3Months/ytd/all) }
- **series**: { fieldId, mode (single/many) } — for grouping/breakdown
- **values**: Array of { fieldId, agg (sum/avg/count), format (currency/percent/number) }
- **filters**: Array of { fieldId, operator (eq/neq/in/gte/lte), values, scope (widget/dashboard) }

## Rules
- Only use field IDs from the available fields list above.
- X-axis should be a date or dimension field (isMeasure: false).
- Values should be measure fields (isMeasure: true) or number fields.
- Series/breakdown should be dimension fields (isMeasure: false).
- When you have enough info, call the update_widget_config tool to apply changes.
- Be concise and helpful. After applying changes, briefly describe what you configured.
- You can make partial updates — only include the fields you want to change.

## CRITICAL: Field-Aware Responses
- ALWAYS reference fields by their display name followed by the source abbreviation in parentheses. Examples: "Revenue (QB)", "Reporting Month (NT)", "Deal Amount (HS)".
- NEVER use generic language like "the data", "your metric", or "the field". Always name the specific field with its source tag.
- Source abbreviations: QB = QuickBooks, HS = HubSpot, NT = naitive.

## Smart Clarification Rules
- When the user's request is ambiguous (e.g., "show revenue" could mean Revenue (QB) or Deal Amount (HS)), respond ONLY with a content message asking which field they mean. Do NOT include a configUpdate.
- When the user specifies a chart type but not axes/values, ask what fields to use before applying.
- When the user says "last 6 months" or similar time ranges not matching existing window options, ask whether they want "last3Months", "ytd", or "all".
- If a request is clear and unambiguous, apply the configUpdate immediately — do NOT ask unnecessary questions.

## Compound Request Handling
- When a user message contains multiple distinct requests (e.g., "change to line chart and add net income"), apply ALL changes in a single configUpdate tool call.
- In your content response, enumerate each change as a numbered list so the user can verify:
  Example: "Applied 2 changes:\\n1. Chart type → line\\n2. Added Net Income (QB) to values (sum, $)"
- If one part is ambiguous but another is clear, apply the clear part and ask about the ambiguous part.

## Response Format
- Either respond with a configUpdate tool call (when confident) OR just a content message with clarifying questions (when ambiguous). Avoid both simultaneously when uncertain.
- After applying changes, describe each change referencing exact field names and source tags.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, currentConfig } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemWithContext = `${SYSTEM_PROMPT}\n\n## Current Widget Config\n${JSON.stringify(currentConfig, null, 2)}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemWithContext },
          ...messages,
        ],
        temperature: 0.4,
        tools: [
          {
            type: "function",
            function: {
              name: "update_widget_config",
              description: "Apply configuration changes to the widget. Only include fields you want to change. Use this ONLY when you are confident about the user's intent.",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Widget display name" },
                  type: { type: "string", enum: ["table", "bar", "line", "column", "columnChart", "kpi"] },
                  xAxis: {
                    type: "object",
                    properties: {
                      fieldId: { type: "string" },
                      grain: { type: "string", enum: ["day", "month", "quarter", "year"] },
                      window: { type: "string", enum: ["last3Months", "ytd", "all"] },
                    },
                  },
                  series: {
                    type: "object",
                    properties: {
                      fieldId: { type: "string" },
                      mode: { type: "string", enum: ["single", "many"] },
                    },
                  },
                  values: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        fieldId: { type: "string" },
                        agg: { type: "string", enum: ["sum", "avg", "count"] },
                        format: { type: "string", enum: ["currency", "percent", "number"] },
                      },
                      required: ["fieldId", "agg", "format"],
                    },
                  },
                  filters: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        fieldId: { type: "string" },
                        operator: { type: "string", enum: ["eq", "neq", "in", "gte", "lte"] },
                        values: { type: "array", items: {} },
                        scope: { type: "string", enum: ["widget", "dashboard"] },
                      },
                      required: ["fieldId", "operator", "values"],
                    },
                  },
                },
              },
            },
          },
        ],
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to get AI response");
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) throw new Error("No response from AI");

    const result: { content: string; configUpdate?: Record<string, any> } = { content: "" };

    // Handle tool calls
    if (choice.message?.tool_calls?.length) {
      const toolCall = choice.message.tool_calls[0];
      if (toolCall.function?.name === "update_widget_config") {
        try {
          result.configUpdate = JSON.parse(toolCall.function.arguments);
        } catch {
          console.error("Failed to parse tool call args");
        }
      }
    }

    // Get text content
    result.content = choice.message?.content || "";

    // If tool was called but no text, generate a brief confirmation
    if (result.configUpdate && !result.content) {
      result.content = "Configuration applied.";
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Widget builder chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
