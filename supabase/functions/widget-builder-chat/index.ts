import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { anthropicFetch } from "../_shared/anthropicUsage.ts";

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

const SYSTEM_PROMPT = `You are naitive's Widget Builder AI. You help users build data visualization widgets by understanding what they want to see and configuring the widget accordingly.

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

const TOOL_DEFINITION = {
  name: "update_widget_config",
  description: "Apply configuration changes to the widget. Only include fields you want to change. Use this ONLY when you are confident about the user's intent.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string" as const, description: "Widget display name" },
      type: { type: "string" as const, enum: ["table", "bar", "line", "column", "columnChart", "kpi"] },
      xAxis: {
        type: "object" as const,
        properties: {
          fieldId: { type: "string" as const },
          grain: { type: "string" as const, enum: ["day", "week", "month", "quarter", "year"] },
          window: { type: "string" as const, enum: ["last3Months", "ytd", "all"] },
        },
      },
      series: {
        type: "object" as const,
        properties: {
          fieldId: { type: "string" as const },
          mode: { type: "string" as const, enum: ["single", "many"] },
        },
      },
      values: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            fieldId: { type: "string" as const },
            agg: { type: "string" as const, enum: ["sum", "avg", "count"] },
            format: { type: "string" as const, enum: ["currency", "percent", "number"] },
          },
          required: ["fieldId", "agg", "format"],
        },
      },
      filters: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            fieldId: { type: "string" as const },
            operator: { type: "string" as const, enum: ["eq", "neq", "in", "gte", "lte"] },
            values: { type: "array" as const, items: {} },
            scope: { type: "string" as const, enum: ["widget", "dashboard"] },
          },
          required: ["fieldId", "operator", "values"],
        },
      },
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, currentConfig } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const systemWithContext = `${SYSTEM_PROMPT}\n\n## Current Widget Config\n${JSON.stringify(currentConfig, null, 2)}`;

    // Convert messages to Anthropic format (no "system" role in messages array)
    const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'system' ? 'user' : m.role,
      content: m.content,
    }));

    const response = await anthropicFetch({ feature: "widget-builder-chat" }, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2048,
        system: systemWithContext,
        messages: anthropicMessages,
        temperature: 0.4,
        tools: [TOOL_DEFINITION],
        tool_choice: { type: "auto" },
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
      console.error("Anthropic API error:", response.status, errorText);
      throw new Error("Failed to get AI response");
    }

    const data = await response.json();

    const result: { content: string; configUpdate?: Record<string, any> } = { content: "" };

    // Anthropic returns content as an array of content blocks
    if (data.content && Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === "text") {
          result.content += block.text;
        } else if (block.type === "tool_use" && block.name === "update_widget_config") {
          result.configUpdate = block.input;
        }
      }
    }

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
