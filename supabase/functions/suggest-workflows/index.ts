import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WorkflowSuggestion {
  id: string;
  title: string;
  description: string;
  reasoning: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
  priority: "high" | "medium" | "low";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch user's data for analysis
    const [dealsResult, activitiesResult, workflowsResult, lendersResult] = await Promise.all([
      supabase.from("deals").select("id, stage, status, created_at, updated_at").limit(100),
      supabase.from("activity_logs").select("action, created_at, deal_id").order("created_at", { ascending: false }).limit(200),
      supabase.from("workflows").select("trigger_type, is_active").eq("user_id", user.id),
      supabase.from("deal_lenders").select("stage, updated_at").limit(100)
    ]);

    const deals = dealsResult.data || [];
    const activities = activitiesResult.data || [];
    const existingWorkflows = workflowsResult.data || [];
    const lenders = lendersResult.data || [];

    // Analyze patterns
    const analysis = {
      totalDeals: deals.length,
      dealStages: [...new Set(deals.map(d => d.stage))],
      recentActivities: activities.slice(0, 50).map(a => a.action),
      existingTriggerTypes: existingWorkflows.map(w => w.trigger_type),
      hasLenderActivity: lenders.length > 0,
      stageChangeFrequency: activities.filter(a => a.action?.includes("stage")).length,
      dealCreationFrequency: activities.filter(a => a.action?.includes("created")).length,
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a workflow automation expert. Analyze the user's deal management patterns and suggest helpful workflows they could create.

Based on the analysis provided, suggest 2-4 relevant workflows that would help automate their processes. Consider:
1. Common activities they're doing manually that could be automated
2. Trigger types they haven't used yet
3. Notifications that would help them stay informed
4. Integrations that could streamline their workflow

Prioritize suggestions that would have the most impact.`;

    const userPrompt = `Analyze this deal management activity and suggest workflows:

Data Analysis:
- Total deals: ${analysis.totalDeals}
- Deal stages used: ${analysis.dealStages.join(", ") || "None yet"}
- Recent activity types: ${[...new Set(analysis.recentActivities)].slice(0, 10).join(", ") || "None yet"}
- Existing workflow triggers: ${analysis.existingTriggerTypes.join(", ") || "None"}
- Has lender activity: ${analysis.hasLenderActivity}
- Stage change frequency (last 200 activities): ${analysis.stageChangeFrequency}
- Deal creation frequency (last 200 activities): ${analysis.dealCreationFrequency}

Suggest 2-4 workflows that would be most valuable for this user.`;

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
          { role: "user", content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_workflows",
              description: "Return workflow suggestions based on user activity analysis",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string", description: "Short workflow title" },
                        description: { type: "string", description: "What the workflow does" },
                        reasoning: { type: "string", description: "Why this workflow is suggested based on user patterns" },
                        triggerType: { 
                          type: "string",
                          enum: ["deal_stage_change", "lender_stage_change", "new_deal", "deal_closed", "scheduled"]
                        },
                        triggerConfig: { type: "object" },
                        actions: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              type: { 
                                type: "string",
                                enum: ["send_notification", "send_email", "webhook", "update_field"]
                              },
                              config: { type: "object" }
                            },
                            required: ["type", "config"]
                          }
                        },
                        priority: { type: "string", enum: ["high", "medium", "low"] }
                      },
                      required: ["title", "description", "reasoning", "triggerType", "actions", "priority"]
                    }
                  }
                },
                required: ["suggestions"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "suggest_workflows" } }
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
      throw new Error("Failed to generate suggestions");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall || toolCall.function.name !== "suggest_workflows") {
      throw new Error("Failed to generate suggestions - no valid response");
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    
    // Add IDs to suggestions
    const suggestions: WorkflowSuggestion[] = (parsed.suggestions || []).map((s: any, index: number) => ({
      id: `suggestion-${Date.now()}-${index}`,
      title: s.title,
      description: s.description,
      reasoning: s.reasoning,
      triggerType: s.triggerType,
      triggerConfig: s.triggerConfig || {},
      actions: (s.actions || []).map((a: any) => ({
        type: a.type,
        config: a.config || {}
      })),
      priority: s.priority || "medium"
    }));

    return new Response(
      JSON.stringify({ suggestions, analysis: { dealCount: analysis.totalDeals, activityCount: activities.length } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error generating workflow suggestions:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to generate suggestions" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
