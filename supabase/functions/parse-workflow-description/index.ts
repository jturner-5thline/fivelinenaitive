import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WorkflowAction {
  id: string;
  type: "send_notification" | "send_email" | "webhook" | "update_field";
  config: Record<string, unknown>;
}

interface WorkflowData {
  name: string;
  description: string;
  isActive: boolean;
  triggerType: "deal_stage_change" | "lender_stage_change" | "new_deal" | "deal_closed" | "scheduled";
  triggerConfig: Record<string, unknown>;
  actions: WorkflowAction[];
}

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

    const systemPrompt = `You are a workflow configuration parser. Your job is to convert natural language descriptions of workflows into structured workflow configurations.

Available trigger types:
- deal_stage_change: Triggers when a deal moves to a different stage. Config: { fromStage?: string, toStage?: string }
- lender_stage_change: Triggers when a lender status changes. Config: { fromStage?: string, toStage?: string }
- new_deal: Triggers when a new deal is created. No additional config needed.
- deal_closed: Triggers when a deal is closed (won or lost). Config: { closedStatus?: 'won' | 'lost' }
- scheduled: Runs on a schedule. Config: { schedule: 'daily' | 'weekly' | 'monthly' }

Available action types:
- send_notification: Send an in-app notification. Config: { title: string, message: string }
- send_email: Send an email. Config: { subject: string, body: string }
- webhook: Call an external URL. Config: { url: string }
- update_field: Update a deal field. Config: { field: 'status' | 'stage' | 'manager', value: string }

Parse the user's description and return a valid workflow configuration as a JSON object with these fields:
- name (string): A short descriptive name
- description (string): Brief description of what the workflow does
- triggerType (string, one of: deal_stage_change, lender_stage_change, new_deal, deal_closed, scheduled)
- triggerConfig (object): Config for the trigger
- actions (array of objects with "type" and "config" fields)

Be smart about interpreting intent - if they mention "email", use send_email. If they mention "notify" or "alert", use send_notification. If they mention "Zapier" or "webhook", use webhook.

Respond ONLY with valid JSON, no markdown or explanation.`;

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
          { role: "user", content: `Parse this workflow description into a structured JSON configuration: "${description}"` }
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

    // Extract JSON from response, handling markdown code blocks
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
    
    // Build the workflow data with proper structure
    const workflow: WorkflowData = {
      name: parsed.name || "Untitled Workflow",
      description: parsed.description || "",
      isActive: true,
      triggerType: parsed.triggerType || "new_deal",
      triggerConfig: parsed.triggerConfig || {},
      actions: (parsed.actions || []).map((action: any, index: number) => ({
        id: `action-${Date.now()}-${index}`,
        type: action.type,
        config: action.config || {}
      }))
    };

    // Ensure at least one action if none parsed
    if (workflow.actions.length === 0) {
      workflow.actions.push({
        id: `action-${Date.now()}-0`,
        type: "send_notification",
        config: { title: "Workflow Triggered", message: "Your workflow was triggered" }
      });
    }

    return new Response(
      JSON.stringify({ workflow }),
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
