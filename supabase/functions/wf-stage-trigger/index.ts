import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== Stage name normalization =====
// Main deals table uses kebab-case (e.g. "pre-credit-needs")
// Workflow definitions use snake_case (e.g. "pre_credit_needs")
function normalizeStage(stage: string | null): string | null {
  if (!stage) return null;
  return stage.replace(/-/g, "_");
}

// Map main deals table stage names (kebab-case) to wf_deal_stage enum values (snake_case)
const DEALS_TO_WF_STAGE: Record<string, string> = {
  "ndaneeds-list-sent": "nda_needs_list_sent",
  "pre-credit-needs": "pre_credit_needs",
  "initial-lender-review": "initial_lender_review",
  "initial-feedback": "initial_feedback_call",
  "write-up-pending": "write_up_pending",
  "submitted-to-lenders": "submitted_to_lenders",
  "lenders-in-review": "lenders_in_review",
  "terms-issued": "terms_issued_analysis",
  "in-due-diligence": "due_diligence_client",
  "agreement-pending": "agreement_pending",
  "final-credit-items": "final_credit_items",
  "client-strategy-review": "client_strategy_review",
  "funded-invoiced": "funded_naitive",
  "closed-won": "funded_naitive",
  "closed-lost": "not_moving_forward",
  "on-hold": "nda_needs_list_sent",
};
const STAGE_WORKFLOWS: Record<
  string,
  Array<{
    key: string;
    tasks: Array<{
      title: string;
      description?: string;
      descriptionFn?: (deal: any) => string;
      assigneeRole: "manager" | "analyst" | "ops";
      dueOffsetDays: number;
      isRecurring?: boolean;
      recurrenceRuleJson?: Record<string, unknown>;
      recurrenceStopConditions?: Array<{ field: string; operator: string; value?: unknown }>;
    }>;
    preCondition?: (deal: any, supabase: any) => Promise<boolean>;
    moveTo?: string;
    actions?: Array<{
      type: "send_email" | "create_calendar_event" | "send_notification";
      config: Record<string, unknown>;
    }>;
    postTaskHook?: (deal: any, dueAt: string, supabase: any) => Promise<void>;
  }>
> = {
  // === NEW DEAL ENTRY (fires on deal creation or initial pipeline entry) ===
  "__deal_created": [
    {
      key: "deal_active_followup_task",
      preCondition: async (deal: any, supabase: any) => {
        // Only fire for deals in the active pipeline
        const { data: mainDeal } = await supabase
          .from("deals")
          .select("pipeline_id, company, contact_email")
          .eq("id", deal.id)
          .maybeSingle();

        if (!mainDeal) {
          console.log(`[wf-stage-trigger] deal_active_followup_task: deal not found in main deals table, skipping`);
          return false;
        }

        // Check required fields
        if (!deal.name && !mainDeal.company) {
          console.warn(`[wf-stage-trigger] deal_active_followup_task: missing deal name, skipping`);
          return false;
        }

        return true;
      },
      tasks: [
        {
          title: "Follow up on new deal - request materials",
          descriptionFn: (deal: any) => `Deal: ${deal.name || 'Unknown'} (${deal.company_name || ''})\nContact: ${deal.contact_email || 'N/A'}\nAction: Follow up to collect materials for naitive.`,
          assigneeRole: "manager" as const,
          dueOffsetDays: 3,
          isRecurring: true,
          recurrenceRuleJson: { interval: 3, unit: "days", stopOn: "materials_added" },
          recurrenceStopConditions: [
            { field: "materials_added_to_naitive", operator: "is_true" },
            { field: "pipeline_id", operator: "not_equals", value: "active" },
          ],
        },
      ],
      postTaskHook: async (deal: any, dueAt: string, supabase: any) => {
        await supabase.from("deals").update({ next_follow_up_at: dueAt }).eq("id", deal.id);
        await supabase.from("wf_deals").update({ next_follow_up_at: dueAt }).eq("id", deal.id);
      },
      actions: [
        { type: "send_notification", config: { template: "workflow_task_assigned", message: "New deal entered pipeline – recurring follow-up created" } },
      ],
    },
  ],
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
  initial_feedback: [
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
  // Keep old key for backward compat with wf_deals
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
      preCondition: async (deal: any, supabase: any) => {
        // Check for existing open task
        const { data: existing } = await supabase
          .from("wf_tasks")
          .select("id")
          .eq("deal_id", deal.id)
          .eq("workflow_key", "prop_issued_followup")
          .eq("status", "open")
          .maybeSingle();
        if (existing) {
          console.log(`[wf-stage-trigger] prop_issued_followup: open task already exists, skipping`);
          return false;
        }
        return true;
      },
      tasks: [
        {
          title: "Follow up on proposal",
          assigneeRole: "manager" as const,
          dueOffsetDays: 4,
          isRecurring: true,
          recurrenceRuleJson: { interval: 4, unit: "days" },
          recurrenceStopConditions: [
            { field: "manager_move_forward_decision", operator: "is_true" },
            { field: "pipeline_id", operator: "not_equals", value: "active" },
          ],
        },
      ],
      postTaskHook: async (deal: any, dueAt: string, supabase: any) => {
        await supabase.from("deals").update({ next_follow_up_at: dueAt }).eq("id", deal.id);
        await supabase.from("wf_deals").update({ next_follow_up_at: dueAt }).eq("id", deal.id);
      },
      actions: [
        { type: "send_email", config: { template: "proposal_followup", subject: "Follow-up: Proposal for {deal_name}" } },
      ],
    },
  ],
  agreement_pending: [
    {
      key: "agreement_pending_followup",
      preCondition: async (deal: any, supabase: any) => {
        // Check for existing open task to avoid duplicates
        const { data: existing } = await supabase
          .from("wf_tasks")
          .select("id")
          .eq("deal_id", deal.id)
          .eq("workflow_key", "agreement_pending_followup")
          .eq("status", "open")
          .maybeSingle();
        if (existing) {
          console.log(`[wf-stage-trigger] agreement_pending_followup: open task already exists, skipping`);
          return false;
        }
        return true;
      },
      tasks: [
        {
          title: "Follow up on agreement",
          assigneeRole: "manager" as const,
          dueOffsetDays: 4,
          isRecurring: true,
          recurrenceRuleJson: { interval: 4, unit: "days" },
          recurrenceStopConditions: [
            { field: "manager_move_forward_decision", operator: "is_true" },
            { field: "pipeline_id", operator: "not_equals", value: "active" },
          ],
        },
      ],
      postTaskHook: async (deal: any, dueAt: string, supabase: any) => {
        await supabase.from("deals").update({ next_follow_up_at: dueAt }).eq("id", deal.id);
        await supabase.from("wf_deals").update({ next_follow_up_at: dueAt }).eq("id", deal.id);
      },
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
  terms_issued: [
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
  // Keep old split stages for backward compat with wf_deals
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
  in_due_diligence: [
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
  // Keep old key for backward compat
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
  funded_invoiced: [
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
    {
      key: "funded_feedback_testimonials",
      tasks: [
        { title: "Send email intro for Chandler feedback/testimonial", assigneeRole: "manager", dueOffsetDays: 3 },
      ],
      actions: [
        { type: "send_email", config: { template: "feedback_request", subject: "Feedback Request: {deal_name}" } },
      ],
    },
    {
      key: "funded_lender_review",
      tasks: [{ title: "Rate lenders on performance dimensions", assigneeRole: "manager", dueOffsetDays: 5 }],
    },
  ],
  // Keep old split keys for backward compat with wf_deals
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
    const { data: token } = await supabase
      .from("calendar_tokens")
      .select("access_token, refresh_token, expires_at")
      .eq("user_id", dealOwnerId)
      .maybeSingle();

    if (!token) {
      console.log(`[calendar] No calendar token for user ${dealOwnerId}, skipping`);
      return;
    }

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
    startTime.setHours(10, 0, 0, 0);
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

    // Suppress workflow reminder emails for ANY internal 5th Line staff
    // (any *@5thline.co address). Workflow follow-up reminders (e.g.
    // "Follow-up: Agreement for {deal_name}") are surfaced in the in-app
    // Daily Briefing instead of being delivered via email so they never
    // get routed to internal teammates' real inboxes — the underlying
    // wf_tasks records and reminder logic remain intact.
    //
    // Toggle with EMAIL_INTERNAL_SUPPRESSION_ENABLED env var (default ON).
    const suppressionEnabled =
      (Deno.env.get("EMAIL_INTERNAL_SUPPRESSION_ENABLED") ?? "true").toLowerCase() !== "false";
    try {
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseServiceKey) {
        const userResp = await fetch(
          `${supabaseUrl}/auth/v1/admin/users/${assigneeId}`,
          {
            headers: {
              apikey: supabaseServiceKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
          }
        );
        if (userResp.ok) {
          const userJson = await userResp.json();
          const email = (userJson?.email || "").toLowerCase();
          if (suppressionEnabled && email.endsWith("@5thline.co")) {
            console.log(
              `[email] internal_user_suppressed recipient=${email} subject="${subject}" deal_id=${dealId}`
            );
            // Best-effort audit log (do not block on failure)
            try {
              await fetch(`${supabaseUrl}/rest/v1/email_suppression_log`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  apikey: supabaseServiceKey,
                  Authorization: `Bearer ${supabaseServiceKey}`,
                  Prefer: "return=minimal",
                },
                body: JSON.stringify({
                  intended_recipient: email,
                  reason: "internal_user_suppressed",
                  template: (config.template as string) ?? null,
                  function_name: "wf-stage-trigger",
                  deal_id: dealId,
                  subject,
                  metadata: { assignee_id: assigneeId },
                }),
              });
            } catch (logErr) {
              console.error("[email] suppression_log insert failed:", logErr);
            }
            return;
          }
        }
      }
    } catch (lookupErr) {
      console.error("[email] internal-suppression lookup failed:", lookupErr);
    }

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

    const { deal_id, from_stage, to_stage, org_company_id, event_type } = await req.json();

    if (!deal_id || !to_stage) {
      console.error("[wf-stage-trigger] Missing deal_id or to_stage");
      return new Response(JSON.stringify({ error: "Missing deal_id or to_stage" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedToStage = normalizeStage(to_stage);
    const normalizedFromStage = normalizeStage(from_stage);
    const isDealCreated = event_type === "deal_created";

    console.log(`[wf-stage-trigger] ===== WORKFLOW TRIGGER =====`);
    console.log(`[wf-stage-trigger] Deal: ${deal_id}`);
    console.log(`[wf-stage-trigger] Event: ${event_type || 'stage_change'}`);
    console.log(`[wf-stage-trigger] Raw stages: ${from_stage} → ${to_stage}`);
    console.log(`[wf-stage-trigger] Normalized: ${normalizedFromStage} → ${normalizedToStage}`);

    // Try to get deal from wf_deals first (workflow system), then fall back to main deals table
    let deal: any = null;
    let dealName = "Unknown Deal";

    const { data: wfDeal } = await supabase
      .from("wf_deals")
      .select("*")
      .eq("id", deal_id)
      .maybeSingle();

    if (wfDeal) {
      deal = wfDeal;
      dealName = wfDeal.name || "Unknown Deal";
      console.log(`[wf-stage-trigger] Found deal in wf_deals: ${dealName}`);
    } else {
      // Fall back to main deals table
      const { data: mainDeal } = await supabase
        .from("deals")
        .select("id, company, stage, status, user_id, company_id, manager, analyst, deal_owner")
        .eq("id", deal_id)
        .maybeSingle();

      if (!mainDeal) {
        console.error(`[wf-stage-trigger] Deal ${deal_id} not found in either table`);
        return new Response(JSON.stringify({ error: "Deal not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      dealName = mainDeal.company || "Unknown Deal";
      console.log(`[wf-stage-trigger] Found deal in main deals table: ${dealName}`);

      // Resolve manager/analyst/deal_owner display names to auth user IDs via profiles
      const namesToResolve = [mainDeal.manager, mainDeal.analyst, mainDeal.deal_owner].filter(Boolean);
      const nameToUserIdMap: Record<string, string> = {};

      if (namesToResolve.length > 0) {
        const { data: matchedProfiles } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("display_name", namesToResolve);

        if (matchedProfiles) {
          for (const p of matchedProfiles) {
            if (p.display_name) nameToUserIdMap[p.display_name.toLowerCase()] = p.user_id;
          }
        }
        console.log(`[wf-stage-trigger] Resolved ${Object.keys(nameToUserIdMap).length}/${namesToResolve.length} names to user IDs:`, JSON.stringify(nameToUserIdMap));
      }

      const managerId = (mainDeal.manager && nameToUserIdMap[mainDeal.manager.toLowerCase()]) || mainDeal.user_id;
      const analystId = mainDeal.analyst ? (nameToUserIdMap[mainDeal.analyst.toLowerCase()] || null) : null;
      const dealOwnerId = mainDeal.deal_owner ? (nameToUserIdMap[mainDeal.deal_owner.toLowerCase()] || null) : null;
      // ops defaults to deal owner or manager
      const opsId = dealOwnerId || managerId;

      // Auto-create wf_users records for all resolved team members (FK requirement)
      const userIdsToSync = [managerId, analystId, opsId].filter(Boolean) as string[];
      const uniqueUserIds = [...new Set(userIdsToSync)];
      if (uniqueUserIds.length > 0) {
        // Get emails from profiles for wf_users
        const { data: userProfiles } = await supabase
          .from("profiles")
          .select("user_id, display_name")
          .in("user_id", uniqueUserIds);

        const { data: companyMembers } = await supabase
          .from("company_members")
          .select("user_id, role, company_id")
          .in("user_id", uniqueUserIds);

        for (const uid of uniqueUserIds) {
          const profile = userProfiles?.find(p => p.user_id === uid);
          const member = companyMembers?.find(m => m.user_id === uid);
          const { data: authUser } = await supabase.auth.admin.getUserById(uid);
          
          // Map company_members role to wf_user_role enum
          const companyRole = member?.role || "member";
          const wfRole = (companyRole === "owner" || companyRole === "admin") ? "admin" : 
                         (companyRole === "analyst") ? "analyst" :
                         (companyRole === "manager") ? "manager" : "other";

          const { error: wfUserError } = await supabase.from("wf_users").upsert({
            id: uid,
            name: profile?.display_name || "Unknown",
            email: authUser?.user?.email || null,
            role: wfRole,
            auth_user_id: uid,
            company_id: member?.company_id || org_company_id || mainDeal.company_id,
          }, { onConflict: "id" });

          if (wfUserError) {
            console.error(`[wf-stage-trigger] Failed to sync wf_user ${uid}:`, wfUserError);
          } else {
            console.log(`[wf-stage-trigger] ✅ Synced wf_user: ${profile?.display_name || uid}`);
          }
        }
      }

      // Map the main deals stage to a wf_deal_stage enum value
      const wfStage = DEALS_TO_WF_STAGE[mainDeal.stage] || "nda_needs_list_sent";
      console.log(`[wf-stage-trigger] Mapping main deals stage "${mainDeal.stage}" → wf_deal_stage "${wfStage}"`);

      // Auto-create a wf_deals record so tasks and logs can reference it
      const { error: syncError } = await supabase.from("wf_deals").upsert({
        id: mainDeal.id,
        name: mainDeal.company || "Unknown Deal",
        company_name: mainDeal.company,
        stage: wfStage,
        manager_id: managerId,
        analyst_id: analystId,
        ops_id: opsId,
        org_company_id: org_company_id || mainDeal.company_id,
      }, { onConflict: "id" });

      if (syncError) {
        console.error(`[wf-stage-trigger] Failed to sync deal to wf_deals:`, syncError);
      } else {
        console.log(`[wf-stage-trigger] ✅ Synced deal to wf_deals table`);
      }

      deal = {
        id: mainDeal.id,
        name: mainDeal.company,
        company_name: mainDeal.company,
        contact_email: null,
        stage: mainDeal.stage,
        manager_id: managerId,
        analyst_id: analystId,
        ops_id: opsId,
        org_company_id: org_company_id || mainDeal.company_id,
      };

      console.log(`[wf-stage-trigger] Resolved roles - manager: ${managerId} (${mainDeal.manager}), analyst: ${analystId} (${mainDeal.analyst}), ops: ${opsId}`);
    }

    // Determine which workflow sets to check
    const workflowSets: Array<{ stageKey: string; workflows: typeof STAGE_WORKFLOWS[string] }> = [];

    // If this is a new deal creation, add __deal_created workflows
    if (isDealCreated && STAGE_WORKFLOWS["__deal_created"]) {
      workflowSets.push({ stageKey: "__deal_created", workflows: STAGE_WORKFLOWS["__deal_created"] });
      console.log(`[wf-stage-trigger] Adding __deal_created workflows (${STAGE_WORKFLOWS["__deal_created"].length} definitions)`);
    }

    // Add stage-specific workflows
    if (normalizedToStage && STAGE_WORKFLOWS[normalizedToStage]) {
      workflowSets.push({ stageKey: normalizedToStage, workflows: STAGE_WORKFLOWS[normalizedToStage] });
      console.log(`[wf-stage-trigger] Adding stage workflows for "${normalizedToStage}" (${STAGE_WORKFLOWS[normalizedToStage].length} definitions)`);
    }

    if (workflowSets.length === 0) {
      console.log(`[wf-stage-trigger] No workflows defined for stage: ${normalizedToStage} (raw: ${to_stage})`);
      console.log(`[wf-stage-trigger] Available stages: ${Object.keys(STAGE_WORKFLOWS).join(', ')}`);
      return new Response(JSON.stringify({ message: "No workflows for this stage", workflows_run: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let workflowsRun = 0;
    let workflowsSkipped = 0;
    let tasksCreated = 0;
    let actionsExecuted = 0;

    for (const { stageKey, workflows } of workflowSets) {
      for (const wfDef of workflows) {
        console.log(`[wf-stage-trigger] Checking workflow: ${wfDef.key} (stage: ${stageKey})`);

        // Check if workflow is active in DB
        const { data: wfRow } = await supabase
          .from("wf_workflows")
          .select("id, is_active, default_owner_user_id, default_owner_role")
          .eq("key", wfDef.key)
          .maybeSingle();

        if (!wfRow) {
          console.log(`[wf-stage-trigger] ⚠️ Workflow "${wfDef.key}" NOT FOUND in wf_workflows table – skipping`);
          workflowsSkipped++;
          continue;
        }

        if (!wfRow.is_active) {
          console.log(`[wf-stage-trigger] ⏸️ Workflow "${wfDef.key}" is INACTIVE (is_active=false) – skipping`);
          workflowsSkipped++;
          continue;
        }

        console.log(`[wf-stage-trigger] ✅ Workflow "${wfDef.key}" is ACTIVE – executing...`);

        // Check pre-condition if defined
        if (wfDef.preCondition) {
          const shouldProceed = await wfDef.preCondition(deal, supabase);
          if (!shouldProceed) {
            console.log(`[wf-stage-trigger] ⏭️ Pre-condition not met for "${wfDef.key}" – skipping`);
            workflowsSkipped++;
            continue;
          }
        }

        // Resolve owner
        let ownerId = wfRow.default_owner_user_id;
        if (!ownerId) {
          const role = wfRow.default_owner_role || "manager";
          if (role === "manager") ownerId = deal.manager_id;
          else if (role === "analyst") ownerId = deal.analyst_id;
          else if (role === "ops") ownerId = deal.ops_id;
        }
        console.log(`[wf-stage-trigger] Owner resolved: ${ownerId} (role: ${wfRow.default_owner_role})`);

        // Log the workflow run
        const { error: logError } = await supabase.from("wf_workflows_log").insert({
          workflow_id: wfRow.id,
          workflow_name: wfDef.key,
          owner_user_id: null,
          trigger_type: "stage_change",
          deal_id: deal_id,
          org_company_id: org_company_id || deal.org_company_id,
          metadata_json: { from_stage: normalizedFromStage, to_stage: normalizedToStage, event_type, tasks_count: wfDef.tasks.length, actions_count: wfDef.actions?.length || 0 },
        });

        if (logError) {
          console.error(`[wf-stage-trigger] Failed to log workflow run:`, logError);
        }

        // Create tasks
        let lastDueAt: string | null = null;
        for (const taskDef of wfDef.tasks) {
          const rawAssigneeId =
            taskDef.assigneeRole === "manager" ? deal.manager_id :
            taskDef.assigneeRole === "analyst" ? deal.analyst_id :
            taskDef.assigneeRole === "ops" ? deal.ops_id : null;

          // Use auth user IDs directly (no wf_users FK constraint)
          const assigneeId = rawAssigneeId || ownerId || null;

          const dueAt = new Date(Date.now() + taskDef.dueOffsetDays * 86400000).toISOString();
          lastDueAt = dueAt;

          console.log(`[wf-stage-trigger] Creating task: "${taskDef.title}" → assignee: ${assigneeId} (${taskDef.assigneeRole}), due: ${dueAt}`);

          const { error: taskError } = await supabase.from("wf_tasks").insert({
            deal_id,
            title: taskDef.title,
            description: (taskDef.descriptionFn ? taskDef.descriptionFn(deal) : taskDef.description) || null,
            status: "open",
            assignee_id: assigneeId,
            created_by_id: ownerId,
            workflow_owner_id: ownerId,
            workflow_key: wfDef.key,
            trigger_source: "stage_change",
            is_recurring: taskDef.isRecurring || false,
            recurrence_rule_json: taskDef.recurrenceRuleJson || null,
            recurrence_stop_conditions: taskDef.recurrenceStopConditions || null,
            due_at: dueAt,
            org_company_id: org_company_id || deal.org_company_id,
          });

          if (taskError) {
            console.error(`[wf-stage-trigger] ❌ Failed to create task "${taskDef.title}":`, taskError);
          } else {
            tasksCreated++;
            console.log(`[wf-stage-trigger] ✅ Task created: "${taskDef.title}"`);
          }
        }

        // Run post-task hook (e.g., update next_follow_up_at)
        if (wfDef.postTaskHook && lastDueAt) {
          try {
            await wfDef.postTaskHook(deal, lastDueAt, supabase);
            console.log(`[wf-stage-trigger] ✅ Post-task hook executed for "${wfDef.key}"`);
          } catch (hookErr) {
            console.error(`[wf-stage-trigger] ❌ Post-task hook failed for "${wfDef.key}":`, hookErr);
          }
        }

        // Execute actions
        if (wfDef.actions) {
          for (const action of wfDef.actions) {
            try {
              const primaryAssigneeRole = wfDef.tasks[0]?.assigneeRole || "manager";
              const primaryAssigneeId =
                primaryAssigneeRole === "manager" ? deal.manager_id :
                primaryAssigneeRole === "analyst" ? deal.analyst_id :
                primaryAssigneeRole === "ops" ? deal.ops_id : ownerId;

              console.log(`[wf-stage-trigger] Executing action: ${action.type} for ${wfDef.key}`);

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
              console.error(`[wf-stage-trigger] ❌ Action failed ${action.type} for ${wfDef.key}:`, actionErr);
            }
          }
        }

        // Move stage if defined
        if (wfDef.moveTo) {
          console.log(`[wf-stage-trigger] Moving deal stage to: ${wfDef.moveTo}`);
          await supabase.from("wf_deals").update({ stage: wfDef.moveTo }).eq("id", deal_id);
        }

        workflowsRun++;
      }
    }

    console.log(`[wf-stage-trigger] ===== SUMMARY =====`);
    console.log(`[wf-stage-trigger] Workflows run: ${workflowsRun}, Skipped: ${workflowsSkipped}, Tasks created: ${tasksCreated}, Actions executed: ${actionsExecuted}`);

    return new Response(
      JSON.stringify({ success: true, workflows_run: workflowsRun, workflows_skipped: workflowsSkipped, tasks_created: tasksCreated, actions_executed: actionsExecuted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[wf-stage-trigger] ❌ Unhandled error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
