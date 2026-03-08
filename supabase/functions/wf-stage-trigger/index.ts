import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Stage-triggered workflow definitions: stage -> array of { workflowKey, tasks, actions }
const STAGE_WORKFLOWS: Record<
  string,
  Array<{
    key: string;
    tasks: Array<{
      title: string;
      assigneeRole: "manager" | "analyst" | "ops";
      dueOffsetDays: number;
      isRecurring?: boolean;
      recurrenceRuleJson?: Record<string, unknown>;
    }>;
    moveTo?: string;
    actions?: Array<{
      type: "send_email" | "create_calendar_event" | "send_notification";
      config: Record<string, unknown>;
    }>;
  }>
> = {
  pre_credit_needs: [
    {
      key: "analyst_prepare_model_memo",
      tasks: [
        { title: "Upload, map, review materials; create memo & model", assigneeRole: "analyst", dueOffsetDays: 5 },
      ],
      actions: [
        {
          type: "send_notification",
          config: { template: "workflow_task_assigned", message: "New task: Upload, map, review materials; create memo & model" },
        },
      ],
    },
  ],
  manager_approves_preview: [],
  initial_lender_review: [
    {
      key: "initial_lender_review_entry",
      tasks: [
        { title: "Compile lender list and add to deal", assigneeRole: "manager", dueOffsetDays: 3 },
      ],
      actions: [
        { type: "send_notification", config: { template: "workflow_task_assigned", message: "New task: Compile lender list" } },
      ],
    },
  ],
  initial_feedback_call: [
    {
      key: "initial_feedback_entry",
      tasks: [
        { title: "Complete initial feedback call and prep agenda", assigneeRole: "manager", dueOffsetDays: 3 },
      ],
      actions: [
        { type: "create_calendar_event", config: { summary_template: "Initial Feedback Call – {deal_name}", durationMinutes: 30, offsetDays: 2 } },
        { type: "send_notification", config: { template: "workflow_task_assigned", message: "Feedback call scheduled" } },
      ],
    },
  ],
  prop_in_dev: [
    {
      key: "proposal_completed_sent_task",
      tasks: [
        { title: "Proposal Completed and Sent", assigneeRole: "manager", dueOffsetDays: 5 },
      ],
    },
  ],
  prop_issued: [
    {
      key: "prop_issued_followup",
      tasks: [
        {
          title: "Follow up on proposal",
          assigneeRole: "manager",
          dueOffsetDays: 4,
          isRecurring: true,
          recurrenceRuleJson: { interval: 4, unit: "days" },
        },
      ],
      actions: [
        { type: "send_email", config: { template: "proposal_followup", subject: "Follow-up: Proposal for {deal_name}" } },
      ],
    },
  ],
  agreement_pending: [
    {
      key: "agreement_pending_followup",
      tasks: [
        {
          title: "Follow up on agreement",
          assigneeRole: "manager",
          dueOffsetDays: 4,
          isRecurring: true,
          recurrenceRuleJson: { interval: 4, unit: "days" },
        },
      ],
      actions: [
        { type: "send_email", config: { template: "agreement_followup", subject: "Follow-up: Agreement for {deal_name}" } },
      ],
    },
  ],
  final_credit_items: [
    {
      key: "final_credit_retainer",
      tasks: [{ title: "Initial Retainer Fee – link to invoice form", assigneeRole: "manager", dueOffsetDays: 3 }],
      actions: [
        { type: "send_notification", config: { template: "workflow_task_assigned", message: "Retainer fee invoice needed" } },
      ],
    },
    {
      key: "final_credit_intro_jen",
      tasks: [{ title: "Intro to Jen for controller intro", assigneeRole: "manager", dueOffsetDays: 2 }],
      actions: [
        { type: "send_email", config: { template: "intro_email", subject: "Introduction: {deal_name} – Controller Intro" } },
      ],
    },
    {
      key: "final_credit_prep_kickoff_email",
      tasks: [{ title: "Prep Kick Off Email", assigneeRole: "analyst", dueOffsetDays: 2 }],
    },
    {
      key: "final_credit_send_kickoff_email",
      tasks: [{ title: "Review and Send Kick Off Email", assigneeRole: "manager", dueOffsetDays: 3 }],
      actions: [
        { type: "send_email", config: { template: "kickoff_email", subject: "Kick Off: {deal_name}" } },
      ],
    },
    {
      key: "final_credit_materials_review",
      tasks: [
        { title: "Receive and review materials in Credit File, reassign to Manager", assigneeRole: "analyst", dueOffsetDays: 5 },
      ],
    },
  ],
  client_strategy_review: [
    {
      key: "client_strategy_set_call",
      tasks: [{ title: "Set kick-off call with client", assigneeRole: "manager", dueOffsetDays: 2 }],
      actions: [
        { type: "create_calendar_event", config: { summary_template: "Strategy Kick-off Call – {deal_name}", durationMinutes: 45, offsetDays: 3 } },
        { type: "send_notification", config: { template: "workflow_task_assigned", message: "Set kick-off call with client" } },
      ],
    },
    {
      key: "client_strategy_agenda",
      tasks: [
        { title: "Prep kick-off call agenda; reassign to Manager", assigneeRole: "analyst", dueOffsetDays: 2 },
        { title: "Set internal kick-off call after client call", assigneeRole: "manager", dueOffsetDays: 3 },
      ],
      actions: [
        { type: "create_calendar_event", config: { summary_template: "Internal Strategy Debrief – {deal_name}", durationMinutes: 30, offsetDays: 4 } },
      ],
    },
  ],
  write_up_pending: [
    {
      key: "write_up_materials_review",
      tasks: [{ title: "Review DealSpace with all materials", assigneeRole: "analyst", dueOffsetDays: 3 }],
    },
    {
      key: "write_up_create_and_approve",
      tasks: [
        { title: "Create Teaser or Write Up Draft, reassign to Manager", assigneeRole: "analyst", dueOffsetDays: 5 },
        { title: "Approve write up", assigneeRole: "manager", dueOffsetDays: 5 },
        { title: "Prep Data Room, reassign to Manager for approval", assigneeRole: "analyst", dueOffsetDays: 5 },
        { title: "Add lenders to Naitive", assigneeRole: "manager", dueOffsetDays: 5 },
        { title: "Draft email to lenders, reassign to Manager", assigneeRole: "analyst", dueOffsetDays: 5 },
        { title: "Confirm email to lenders sent; move to next stage", assigneeRole: "manager", dueOffsetDays: 5 },
      ],
    },
  ],
  submitted_to_lenders: [
    {
      key: "submitted_to_lenders_emails",
      tasks: [{ title: "Monitor lender replies", assigneeRole: "manager", dueOffsetDays: 3 }],
      actions: [
        { type: "send_email", config: { template: "lender_submission", subject: "New Opportunity: {deal_name}" } },
        { type: "send_notification", config: { template: "workflow_task_assigned", message: "Deal submitted to lenders – monitoring replies" } },
      ],
    },
  ],
  lenders_in_review: [
    {
      key: "lenders_review_weekly_check",
      tasks: [
        { title: "Weekly check on platform for lender updates", assigneeRole: "manager", dueOffsetDays: 5 },
        { title: "Track responses, set management calls", assigneeRole: "analyst", dueOffsetDays: 5 },
        { title: "Prepare answers to lender questions", assigneeRole: "analyst", dueOffsetDays: 5 },
        { title: "Confirm terms are real, save to file", assigneeRole: "analyst", dueOffsetDays: 5 },
      ],
      actions: [
        { type: "create_calendar_event", config: { summary_template: "Weekly Lender Review – {deal_name}", durationMinutes: 30, offsetDays: 5, isRecurring: true } },
      ],
    },
  ],
  terms_issued_analysis: [
    {
      key: "terms_issued_analysis",
      tasks: [
        { title: "Review Terms and prep Terms Analysis", assigneeRole: "analyst", dueOffsetDays: 5 },
        { title: "Call to review terms with client", assigneeRole: "manager", dueOffsetDays: 5 },
      ],
      actions: [
        { type: "create_calendar_event", config: { summary_template: "Terms Review Call – {deal_name}", durationMinutes: 45, offsetDays: 3 } },
        { type: "send_notification", config: { template: "terms_issued", message: "Terms issued – review needed" } },
      ],
    },
  ],
  terms_issued_payment: [
    {
      key: "terms_issued_payment",
      tasks: [
        { title: "Send milestone invoice", assigneeRole: "manager", dueOffsetDays: 3 },
        { title: "Re-Intro to Jen for controller intro", assigneeRole: "manager", dueOffsetDays: 3 },
      ],
      actions: [
        { type: "send_email", config: { template: "milestone_invoice", subject: "Milestone Invoice: {deal_name}" } },
      ],
    },
  ],
  due_diligence_client: [
    {
      key: "due_diligence_client_flow",
      tasks: [
        { title: "Set educational call with client", assigneeRole: "manager", dueOffsetDays: 5 },
        { title: "Set follow-up emails to lender and client", assigneeRole: "manager", dueOffsetDays: 5 },
        { title: "Inform Ops and team once ready", assigneeRole: "manager", dueOffsetDays: 5 },
        { title: "Check if marketing case; ask for feedback", assigneeRole: "manager", dueOffsetDays: 5 },
      ],
      actions: [
        { type: "create_calendar_event", config: { summary_template: "Due Diligence Educational Call – {deal_name}", durationMinutes: 60, offsetDays: 3 } },
        { type: "send_notification", config: { template: "due_diligence_started", message: "Due diligence phase started" } },
      ],
    },
  ],
  funded_naitive: [
    {
      key: "funded_naitive_main",
      tasks: [{ title: "Move to Closed Won when appropriate", assigneeRole: "manager", dueOffsetDays: 7 }],
      actions: [
        { type: "send_notification", config: { template: "deal_funded", message: "Deal funded! 🎉" } },
      ],
    },
  ],
  funded_payment: [
    {
      key: "funded_payment_workflow",
      tasks: [
        { title: "Send final fee invoice", assigneeRole: "manager", dueOffsetDays: 3 },
        { title: "Re-Intro to Jen for controller intro", assigneeRole: "manager", dueOffsetDays: 3 },
      ],
      actions: [
        { type: "send_email", config: { template: "final_invoice", subject: "Final Fee Invoice: {deal_name}" } },
      ],
    },
  ],
  funded_feedback_testimonials: [
    {
      key: "funded_feedback_testimonials",
      tasks: [
        { title: "Send email intro for Chandler feedback/testimonial", assigneeRole: "manager", dueOffsetDays: 3 },
      ],
      actions: [
        { type: "send_email", config: { template: "feedback_request", subject: "Feedback Request: {deal_name}" } },
      ],
    },
  ],
  funded_lender_review: [
    {
      key: "funded_lender_review",
      tasks: [{ title: "Rate lenders on performance dimensions", assigneeRole: "manager", dueOffsetDays: 5 }],
    },
  ],
};

// ===== Helper: Create Google Calendar event for a deal owner =====
async function createCalendarEvent(
  supabase: any,
  dealOwnerId: string,
  dealName: string,
  config: Record<string, unknown>
) {
  try {
    // Get the owner's calendar token
    const { data: token } = await supabase
      .from("calendar_tokens")
      .select("access_token, refresh_token, expires_at")
      .eq("user_id", dealOwnerId)
      .maybeSingle();

    if (!token) {
      console.log(`[calendar] No calendar token for user ${dealOwnerId}, skipping`);
      return;
    }

    // Check if token is expired and refresh if needed
    let accessToken = token.access_token;
    if (new Date(token.expires_at) <= new Date()) {
      const clientId = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");
      if (clientId && clientSecret) {
        const refreshResp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: token.refresh_token,
            grant_type: "refresh_token",
          }),
        });
        if (refreshResp.ok) {
          const refreshData = await refreshResp.json();
          accessToken = refreshData.access_token;
          await supabase
            .from("calendar_tokens")
            .update({
              access_token: accessToken,
              expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
            })
            .eq("user_id", dealOwnerId);
        } else {
          console.error("[calendar] Token refresh failed");
          return;
        }
      } else {
        console.log("[calendar] No Google credentials, skipping calendar event");
        return;
      }
    }

    const summary = (config.summary_template as string).replace("{deal_name}", dealName);
    const offsetDays = (config.offsetDays as number) || 2;
    const durationMinutes = (config.durationMinutes as number) || 30;

    const startTime = new Date(Date.now() + offsetDays * 86400000);
    startTime.setHours(10, 0, 0, 0); // Default 10am
    const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

    const eventBody = {
      summary,
      start: { dateTime: startTime.toISOString(), timeZone: "America/New_York" },
      end: { dateTime: endTime.toISOString(), timeZone: "America/New_York" },
      reminders: { useDefault: true },
    };

    const calResp = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      }
    );

    if (calResp.ok) {
      const event = await calResp.json();
      console.log(`[calendar] Created event: ${event.id} – ${summary}`);
    } else {
      const err = await calResp.text();
      console.error(`[calendar] Failed to create event: ${err}`);
    }
  } catch (err) {
    console.error("[calendar] Error creating calendar event:", err);
  }
}

// ===== Helper: Send workflow email notification =====
async function sendWorkflowEmail(
  supabaseUrl: string,
  assigneeId: string | null,
  dealId: string,
  dealName: string,
  config: Record<string, unknown>
) {
  if (!assigneeId) return;
  try {
    const subject = ((config.subject as string) || "Workflow Update").replace("{deal_name}", dealName);
    await fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "workflow_action",
        user_id: assigneeId,
        deal_id: dealId,
        deal_name: dealName,
        metadata: {
          template: config.template,
          subject,
          message: ((config.message as string) || "").replace("{deal_name}", dealName),
        },
      }),
    });
    console.log(`[email] Sent workflow email to user ${assigneeId}: ${subject}`);
  } catch (err) {
    console.error("[email] Error sending workflow email:", err);
  }
}

// ===== Helper: Send in-app notification =====
async function sendInAppNotification(
  supabaseUrl: string,
  assigneeId: string | null,
  dealId: string,
  dealName: string,
  config: Record<string, unknown>
) {
  if (!assigneeId) return;
  try {
    await fetch(`${supabaseUrl}/functions/v1/notification-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trigger: "workflow_task_assigned",
        user_id: assigneeId,
        deal_id: dealId,
        metadata: {
          deal_name: dealName,
          message: ((config.message as string) || "").replace("{deal_name}", dealName),
        },
      }),
    });
    console.log(`[notification] Sent in-app notification to ${assigneeId}`);
  } catch (err) {
    console.error("[notification] Error sending notification:", err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { deal_id, from_stage, to_stage, org_company_id } = await req.json();

    if (!deal_id || !to_stage) {
      return new Response(JSON.stringify({ error: "Missing deal_id or to_stage" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[wf-stage-trigger] Deal ${deal_id}: ${from_stage} → ${to_stage}`);

    // Get the deal with role IDs
    const { data: deal, error: dealError } = await supabase
      .from("wf_deals")
      .select("*")
      .eq("id", deal_id)
      .single();

    if (dealError || !deal) {
      console.error("Deal not found:", dealError);
      return new Response(JSON.stringify({ error: "Deal not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get deal name from the main deals table
    let dealName = deal.name || "Unknown Deal";
    const { data: mainDeal } = await supabase
      .from("deals")
      .select("company")
      .eq("id", deal_id)
      .maybeSingle();
    if (mainDeal?.company) dealName = mainDeal.company;

    // Find workflows for this stage
    const stageWorkflows = STAGE_WORKFLOWS[to_stage];
    if (!stageWorkflows || stageWorkflows.length === 0) {
      console.log(`No workflows defined for stage: ${to_stage}`);
      return new Response(JSON.stringify({ message: "No workflows for this stage", workflows_run: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let workflowsRun = 0;
    let tasksCreated = 0;
    let actionsExecuted = 0;

    for (const wfDef of stageWorkflows) {
      // Check if workflow is active in DB
      const { data: wfRow } = await supabase
        .from("wf_workflows")
        .select("id, is_active, default_owner_user_id, default_owner_role")
        .eq("key", wfDef.key)
        .maybeSingle();

      if (!wfRow || !wfRow.is_active) {
        console.log(`Workflow ${wfDef.key} is inactive, skipping`);
        continue;
      }

      // Resolve owner
      let ownerId = wfRow.default_owner_user_id;
      if (!ownerId) {
        const role = wfRow.default_owner_role || "manager";
        if (role === "manager") ownerId = deal.manager_id;
        else if (role === "analyst") ownerId = deal.analyst_id;
        else if (role === "ops") ownerId = deal.ops_id;
      }

      // Log the workflow run
      await supabase.from("wf_workflows_log").insert({
        workflow_id: wfRow.id,
        workflow_name: wfDef.key,
        owner_user_id: ownerId,
        trigger_type: "stage_change",
        deal_id: deal_id,
        org_company_id: org_company_id || deal.org_company_id,
        metadata_json: { from_stage, to_stage, tasks_count: wfDef.tasks.length, actions_count: wfDef.actions?.length || 0 },
      });

      // Create tasks
      for (const taskDef of wfDef.tasks) {
        const assigneeId =
          taskDef.assigneeRole === "manager" ? deal.manager_id :
          taskDef.assigneeRole === "analyst" ? deal.analyst_id :
          taskDef.assigneeRole === "ops" ? deal.ops_id : null;

        const dueAt = new Date(Date.now() + taskDef.dueOffsetDays * 86400000).toISOString();

        const { error: taskError } = await supabase.from("wf_tasks").insert({
          deal_id,
          title: taskDef.title,
          status: "open",
          assignee_id: assigneeId,
          created_by_id: ownerId,
          workflow_owner_id: ownerId,
          workflow_key: wfDef.key,
          trigger_source: "stage_change",
          is_recurring: taskDef.isRecurring || false,
          recurrence_rule_json: taskDef.recurrenceRuleJson || null,
          due_at: dueAt,
          org_company_id: org_company_id || deal.org_company_id,
        });

        if (taskError) {
          console.error(`Failed to create task "${taskDef.title}":`, taskError);
        } else {
          tasksCreated++;
        }
      }

      // Execute actions (Phase 3: live integrations)
      if (wfDef.actions) {
        for (const action of wfDef.actions) {
          try {
            const primaryAssigneeRole = wfDef.tasks[0]?.assigneeRole || "manager";
            const primaryAssigneeId =
              primaryAssigneeRole === "manager" ? deal.manager_id :
              primaryAssigneeRole === "analyst" ? deal.analyst_id :
              primaryAssigneeRole === "ops" ? deal.ops_id : ownerId;

            switch (action.type) {
              case "create_calendar_event":
                await createCalendarEvent(supabase, primaryAssigneeId || ownerId, dealName, action.config);
                actionsExecuted++;
                break;

              case "send_email":
                await sendWorkflowEmail(supabaseUrl, primaryAssigneeId || ownerId, deal_id, dealName, action.config);
                actionsExecuted++;
                break;

              case "send_notification":
                await sendInAppNotification(supabaseUrl, primaryAssigneeId || ownerId, deal_id, dealName, action.config);
                actionsExecuted++;
                break;
            }
          } catch (actionErr) {
            console.error(`[action] Failed ${action.type} for ${wfDef.key}:`, actionErr);
          }
        }
      }

      // Move stage if defined
      if (wfDef.moveTo) {
        await supabase.from("wf_deals").update({ stage: wfDef.moveTo }).eq("id", deal_id);
      }

      workflowsRun++;
    }

    console.log(`[wf-stage-trigger] Completed: ${workflowsRun} workflows, ${tasksCreated} tasks, ${actionsExecuted} actions`);

    return new Response(
      JSON.stringify({ success: true, workflows_run: workflowsRun, tasks_created: tasksCreated, actions_executed: actionsExecuted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[wf-stage-trigger] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
