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
    const { description } = await req.json();

    if (!description || typeof description !== "string") {
      return new Response(
        JSON.stringify({ error: "Description is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a workflow builder assistant. Convert natural language into a visual node-based workflow.

Available node types and their categories:
TRIGGERS (category: "trigger"):
- trigger/lender_event: Fires on lender stage/status changes. Config: { event: "stage_change"|"created"|"updated" }
- trigger/deal_event: Fires on deal changes. Config: { event: "stage_change"|"created"|"closed" }
- trigger/schedule: Runs on schedule. Config: { frequency: "hourly"|"daily"|"weekly"|"monthly", time?: "HH:MM" }
- trigger/webhook: Receives external HTTP data. Config: { method: "POST"|"GET" }

CONDITIONS (category: "condition"):
- condition/equals: If/else branch. Config: { operator: "equals"|"not_equals"|"contains"|"greater_than"|"less_than", compareTo: "value" }
- condition/switch: Multi-branch. Config: { case_1: "value", case_2: "value" }

DATA (category: "data"):
- data/lookup: Fetch from DB. Config: { table: "deals"|"deal_lenders"|"profiles", fields?: "col1,col2" }
- data/template: Format message. Config: { template: "{{var}} text" }
- data/transform: Reshape data. Config: { expression: "code" }

INTEGRATIONS (category: "integration"):
- integration/slack: Post to Slack. Config: { channel: "#channel", username?: "Bot Name" }
- integration/email: Send email. Config: { to: "email", subject: "subject" }
- integration/webhook: HTTP request. Config: { url: "https://...", method: "GET"|"POST"|"PUT" }
- integration/database_insert: Log to DB. Config: { table: "activity_logs"|"deal_flag_notes", activity_type?: "type" }
- integration/notification: In-app notification. Config: { title: "title", priority: "low"|"normal"|"high" }

UTILITY (category: "utility"):
- utility/delay: Wait. Config: { amount: number, unit: "seconds"|"minutes"|"hours" }
- utility/retry: Retry on error. Config: { maxRetries: number, backoffMs: number }

Return a JSON object with:
- name: short workflow name
- description: one-sentence description
- nodes: array of { id, type (from above list), config (filled config object) }
- edges: array of { source (node id), target (node id), sourceHandle? (output key like "true"/"false") }

Layout nodes left-to-right, spacing 270px horizontally. Start triggers at x:50, y:150.
Use sequential IDs like "ai_1", "ai_2", etc.

Respond ONLY with valid JSON.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Build a workflow for: "${description}"` }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
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
      throw new Error("Failed to parse workflow description");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Failed to parse workflow - no response content");
    }

    let jsonStr = content.trim();
    jsonStr = jsonStr.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const jsonStart = jsonStr.search(/[\{\[]/);
    const jsonEnd = jsonStr.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("No JSON found in AI response");
    }
    jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1)
      .replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");

    const parsed = JSON.parse(jsonStr);

    return new Response(
      JSON.stringify({
        workflow: {
          name: parsed.name || "Untitled Workflow",
          description: parsed.description || "",
          nodes: parsed.nodes || [],
          edges: parsed.edges || [],
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error parsing workflow description:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to parse workflow" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
