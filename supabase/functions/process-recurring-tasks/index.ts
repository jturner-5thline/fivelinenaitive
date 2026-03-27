import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface StopCondition {
  field: string;
  operator: "equals" | "not_equals" | "is_true" | "is_false";
  value?: unknown;
}

function evaluateStopCondition(condition: StopCondition, deal: Record<string, unknown>): boolean {
  const fieldValue = deal[condition.field];
  switch (condition.operator) {
    case "is_true":
      return fieldValue === true;
    case "is_false":
      return fieldValue === false || fieldValue === null || fieldValue === undefined;
    case "equals":
      return fieldValue === condition.value;
    case "not_equals":
      return fieldValue !== condition.value;
    default:
      return false;
  }
}

function evaluateAllStopConditions(conditions: StopCondition[], deal: Record<string, unknown>): boolean {
  // If ANY stop condition is met, return true (stop the recurrence)
  return conditions.some((c) => evaluateStopCondition(c, deal));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log("[recurring-tasks] Starting recurring task processing...");

  try {
    const now = new Date().toISOString();

    // Query all recurring tasks that are due
    const { data: dueTasks, error: fetchError } = await supabase
      .from("wf_tasks")
      .select("*")
      .eq("is_recurring", true)
      .eq("status", "open")
      .lte("due_at", now)
      .limit(100);

    if (fetchError) {
      console.error("[recurring-tasks] Error fetching tasks:", fetchError);
      throw fetchError;
    }

    if (!dueTasks || dueTasks.length === 0) {
      console.log("[recurring-tasks] No recurring tasks due");
      return new Response(
        JSON.stringify({ processed: 0, completed: 0, renewed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[recurring-tasks] Found ${dueTasks.length} due recurring tasks`);

    let completed = 0;
    let renewed = 0;

    for (const task of dueTasks) {
      const dealId = task.deal_id;
      console.log(`[recurring-tasks] Processing task "${task.title}" (${task.id}) for deal ${dealId}`);

      // Load the deal record - try wf_deals first, then main deals
      let deal: Record<string, unknown> | null = null;

      const { data: wfDeal } = await supabase
        .from("wf_deals")
        .select("*")
        .eq("id", dealId)
        .maybeSingle();

      if (wfDeal) {
        deal = wfDeal;
      } else {
        const { data: mainDeal } = await supabase
          .from("deals")
          .select("*")
          .eq("id", dealId)
          .maybeSingle();
        deal = mainDeal;
      }

      if (!deal) {
        console.log(`[recurring-tasks] Deal ${dealId} not found, marking task as completed`);
        await supabase.from("wf_tasks").update({ status: "done" }).eq("id", task.id);
        completed++;
        continue;
      }

      // Evaluate stop conditions
      const stopConditions: StopCondition[] = task.recurrence_stop_conditions || [];

      if (stopConditions.length > 0 && evaluateAllStopConditions(stopConditions, deal)) {
        console.log(`[recurring-tasks] Stop condition met for task "${task.title}" – completing`);
        await supabase.from("wf_tasks").update({ status: "done" }).eq("id", task.id);

        // Clear next_follow_up_at on both deal tables
        await supabase.from("deals").update({ next_follow_up_at: null }).eq("id", dealId);
        await supabase.from("wf_deals").update({ next_follow_up_at: null }).eq("id", dealId);

        completed++;
        continue;
      }

      // No stop condition met → create a new task and complete the old one
      const recurrenceRule = task.recurrence_rule_json as Record<string, unknown> | null;
      const intervalDays = (recurrenceRule?.interval as number) || 3;
      const newDueAt = new Date(Date.now() + intervalDays * 86400000).toISOString();

      console.log(`[recurring-tasks] Renewing task "${task.title}" – next due: ${newDueAt}`);

      // Create new task (clone)
      const { error: insertError } = await supabase.from("wf_tasks").insert({
        deal_id: task.deal_id,
        title: task.title,
        description: task.description,
        status: "open",
        assignee_id: task.assignee_id,
        created_by_id: task.created_by_id,
        workflow_owner_id: task.workflow_owner_id,
        workflow_key: task.workflow_key,
        trigger_source: task.trigger_source,
        is_recurring: true,
        recurrence_rule_json: task.recurrence_rule_json,
        recurrence_stop_conditions: task.recurrence_stop_conditions,
        due_at: newDueAt,
        org_company_id: task.org_company_id,
      });

      if (insertError) {
        console.error(`[recurring-tasks] Failed to create renewal task:`, insertError);
        continue;
      }

      // Complete old task
      await supabase.from("wf_tasks").update({ status: "done" }).eq("id", task.id);

      // Update next_follow_up_at on the deal
      await supabase.from("deals").update({ next_follow_up_at: newDueAt }).eq("id", dealId);
      await supabase.from("wf_deals").update({ next_follow_up_at: newDueAt }).eq("id", dealId);

      // Log the renewal
      await supabase.from("wf_workflows_log").insert({
        workflow_name: `recurring_renewal_${task.workflow_key || "unknown"}`,
        trigger_type: "stage_change",
        deal_id: dealId,
        org_company_id: task.org_company_id,
        metadata_json: {
          action: "recurring_renewal",
          old_task_id: task.id,
          new_due_at: newDueAt,
          interval_days: intervalDays,
        },
      });

      renewed++;
    }

    console.log(`[recurring-tasks] Done. Completed: ${completed}, Renewed: ${renewed}`);

    return new Response(
      JSON.stringify({ processed: dueTasks.length, completed, renewed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[recurring-tasks] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
