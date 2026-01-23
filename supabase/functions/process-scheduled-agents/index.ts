import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.log("Unauthorized cron request");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find scheduled triggers that are due
    const now = new Date().toISOString();
    const { data: dueTriggers, error: fetchError } = await supabase
      .from("agent_triggers")
      .select(`
        *,
        agent:agents(*)
      `)
      .eq("trigger_type", "scheduled")
      .eq("is_active", true)
      .lte("next_scheduled_at", now);

    if (fetchError) {
      console.error("Error fetching due triggers:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${dueTriggers?.length || 0} scheduled triggers to process`);

    const results = [];

    for (const trigger of dueTriggers || []) {
      try {
        // Create a pending run
        const { data: run, error: runError } = await supabase
          .from("agent_runs")
          .insert({
            agent_id: trigger.agent_id,
            trigger_id: trigger.id,
            user_id: trigger.user_id,
            status: "pending",
            trigger_event: "scheduled",
            input_context: {
              trigger_type: "scheduled",
              schedule_cron: trigger.schedule_cron,
              scheduled_at: now,
            },
          })
          .select()
          .single();

        if (runError) {
          console.error(`Error creating run for trigger ${trigger.id}:`, runError);
          continue;
        }

        // Call the execute-agent-trigger function
        const executeResponse = await fetch(
          `${supabaseUrl}/functions/v1/execute-agent-trigger`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ runId: run.id }),
          }
        );

        if (!executeResponse.ok) {
          console.error(`Failed to execute trigger ${trigger.id}`);
        }

        // Update next scheduled time
        const { error: updateError } = await supabase
          .from("agent_triggers")
          .update({
            last_triggered_at: now,
            trigger_count: (trigger.trigger_count || 0) + 1,
          })
          .eq("id", trigger.id);

        if (updateError) {
          console.error(`Error updating trigger ${trigger.id}:`, updateError);
        }

        results.push({ triggerId: trigger.id, runId: run.id, status: "queued" });
      } catch (err) {
        console.error(`Error processing trigger ${trigger.id}:`, err);
        results.push({ triggerId: trigger.id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    return new Response(
      JSON.stringify({
        processed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in process-scheduled-agents:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
