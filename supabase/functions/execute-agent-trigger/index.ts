import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AgentRun {
  id: string;
  agent_id: string;
  trigger_id: string | null;
  user_id: string;
  deal_id: string | null;
  status: string;
  trigger_event: string;
  input_context: Record<string, unknown>;
}

interface Agent {
  id: string;
  name: string;
  system_prompt: string;
  personality: string;
  temperature: number;
  can_access_deals: boolean;
  can_access_lenders: boolean;
  can_access_activities: boolean;
  can_access_milestones: boolean;
}

interface AgentTrigger {
  id: string;
  action_type: string;
  action_config: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { run_id } = await req.json();

    // If specific run_id provided, process that one; otherwise process all pending
    let runsQuery = supabase
      .from("agent_runs")
      .select(`
        *,
        agents!inner (*),
        agent_triggers (*)
      `)
      .eq("status", "pending");

    if (run_id) {
      runsQuery = runsQuery.eq("id", run_id);
    }

    const { data: runs, error: runsError } = await runsQuery.limit(10);

    if (runsError) {
      throw new Error(`Failed to fetch runs: ${runsError.message}`);
    }

    if (!runs || runs.length === 0) {
      return new Response(
        JSON.stringify({ message: "No pending runs to process", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const results = [];

    for (const run of runs) {
      const startTime = Date.now();
      const agent = run.agents as Agent;
      const trigger = run.agent_triggers as AgentTrigger | null;

      try {
        // Mark as running
        await supabase
          .from("agent_runs")
          .update({ status: "running", started_at: new Date().toISOString() })
          .eq("id", run.id);

        // Build context
        let contextInfo = "";
        const inputContext = run.input_context as Record<string, unknown>;

        if (run.deal_id && agent.can_access_deals) {
          const { data: deal } = await supabase
            .from("deals")
            .select("*")
            .eq("id", run.deal_id)
            .single();

          if (deal) {
            contextInfo += `\n## Deal Context\n`;
            contextInfo += `- Company: ${deal.company}\n`;
            contextInfo += `- Value: $${deal.value?.toLocaleString() || "N/A"}\n`;
            contextInfo += `- Stage: ${deal.stage}\n`;
            contextInfo += `- Status: ${deal.status}\n`;
          }

          if (agent.can_access_lenders) {
            const { data: lenders } = await supabase
              .from("deal_lenders")
              .select("*")
              .eq("deal_id", run.deal_id)
              .limit(10);

            if (lenders && lenders.length > 0) {
              contextInfo += `\n## Lenders (${lenders.length})\n`;
              lenders.forEach((l: { name: string; stage: string }) => {
                contextInfo += `- ${l.name}: ${l.stage}\n`;
              });
            }
          }
        }

        // Build event-specific prompt
        let eventPrompt = "";
        switch (run.trigger_event) {
          case "deal_created":
            eventPrompt = "A new deal has been created. Provide initial analysis and recommendations.";
            break;
          case "deal_stage_change":
            const oldStage = (inputContext.old_data as Record<string, unknown>)?.stage;
            const newStage = (inputContext.new_data as Record<string, unknown>)?.stage;
            eventPrompt = `The deal stage has changed from "${oldStage}" to "${newStage}". Analyze this transition and provide relevant insights.`;
            break;
          case "deal_closed":
            eventPrompt = "This deal has been closed. Provide a summary and lessons learned.";
            break;
          case "lender_added":
            eventPrompt = "A new lender has been added to this deal. Assess the lender fit and provide recommendations.";
            break;
          case "lender_stage_change":
            eventPrompt = "A lender's status has changed. Analyze the implications and suggest next steps.";
            break;
          case "milestone_completed":
            eventPrompt = "A milestone has been completed. Summarize progress and identify next priorities.";
            break;
          default:
            eventPrompt = "Analyze the current situation and provide insights.";
        }

        // Build the full system prompt
        const fullSystemPrompt = `${agent.system_prompt}

## Event
${eventPrompt}

${contextInfo}

Provide a concise, actionable response based on this event. Focus on insights that would be valuable to the user.`;

        // Call AI
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: fullSystemPrompt },
              { role: "user", content: eventPrompt },
            ],
            temperature: agent.temperature || 0.7,
          }),
        });

        if (!aiResponse.ok) {
          throw new Error(`AI gateway error: ${aiResponse.status}`);
        }

        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error("No response content from AI");
        }

        const duration = Date.now() - startTime;

        // Execute action based on trigger configuration
        const actionType = trigger?.action_type || "generate_insight";
        
        if (actionType === "create_activity" && run.deal_id) {
          await supabase.from("activity_logs").insert({
            deal_id: run.deal_id,
            user_id: run.user_id,
            activity_type: "ai_insight",
            description: `[${agent.name}] ${content.slice(0, 500)}`,
          });
        }

        if (actionType === "update_notes" && run.deal_id) {
          const { data: deal } = await supabase
            .from("deals")
            .select("notes")
            .eq("id", run.deal_id)
            .single();

          const timestamp = new Date().toISOString().split("T")[0];
          const newNote = `\n\n---\n**AI Insight (${timestamp})** - ${agent.name}:\n${content}`;
          
          await supabase
            .from("deals")
            .update({ notes: (deal?.notes || "") + newNote })
            .eq("id", run.deal_id);
        }

        // Mark as completed
        await supabase
          .from("agent_runs")
          .update({
            status: "completed",
            output_content: content,
            completed_at: new Date().toISOString(),
            duration_ms: duration,
          })
          .eq("id", run.id);

        // Update agent last_used_at
        await supabase
          .from("agents")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", agent.id);

        results.push({ run_id: run.id, status: "completed", duration });
      } catch (runError) {
        const errorMessage = runError instanceof Error ? runError.message : "Unknown error";
        
        await supabase
          .from("agent_runs")
          .update({
            status: "failed",
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
          })
          .eq("id", run.id);

        results.push({ run_id: run.id, status: "failed", error: errorMessage });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Execute agent trigger error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
