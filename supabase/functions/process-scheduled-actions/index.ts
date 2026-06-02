import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildFrom } from '../_shared/resendFrom.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Recurrence stop-condition helpers ──────────────────────────────

interface StopCondition {
  field: string;
  operator: string;
  value?: unknown;
}

function evaluateStopConditions(
  conditions: StopCondition[] | null | undefined,
  task: Record<string, unknown>,
  deal: Record<string, unknown>
): boolean {
  if (!conditions || !Array.isArray(conditions) || conditions.length === 0) return false;

  return conditions.some((c) => {
    const dealValue = deal[c.field];

    // Special: deal_stage_changed  – stop if deal stage no longer equals the expected value
    if (c.field === 'deal_stage_changed' && c.operator === 'not_equals') {
      return deal.stage !== c.value;
    }

    // Special: manager_move_forward_decision
    if (c.field === 'manager_move_forward_decision' && c.operator === 'equals' && c.value === true) {
      return dealValue === true;
    }
    if (c.field === 'manager_move_forward_decision' && c.operator === 'is_true') {
      return dealValue === true;
    }

    // Special: prop_issued – stop if deal has moved past nda_materials_stage
    if (c.field === 'prop_issued' && c.operator === 'equals' && c.value === true) {
      const pastStages = ['closing', 'closed_won', 'closed_lost', 'funded', 'agreement_pending'];
      return pastStages.includes(String(deal.stage || ''));
    }

    // Generic operators
    switch (c.operator) {
      case 'is_true':
        return dealValue === true;
      case 'is_false':
        return dealValue === false || dealValue === null || dealValue === undefined;
      case 'equals':
        return dealValue === c.value;
      case 'not_equals':
        return dealValue !== c.value;
      default:
        return false;
    }
  });
}

interface ScheduledAction {
  id: string;
  workflow_run_id: string;
  action: {
    id: string;
    type: string;
    config: Record<string, any>;
  };
  trigger_data: Record<string, any>;
  scheduled_for: string;
  status: string;
}

interface ActionResult {
  actionId: string;
  type: string;
  success: boolean;
  message: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ──────────────────────────────────────────────────────────────────
  // CRITICAL: This function has TWO independent responsibilities that
  // run on every cron tick:
  //   (A) Drain due rows from public.scheduled_actions   (delayed actions
  //       from the visual workflow builder).
  //   (B) Renew due rows from public.wf_tasks WHERE is_recurring=true
  //       (code-defined follow-up workflows like deal_active_followup_task).
  //
  // BUG FIXED 2026-04-20: previously we early-returned when (A) was empty,
  // which meant (B) NEVER ran in production (scheduled_actions has been
  // empty since launch). Result: 1,060 stuck recurring follow-ups.
  // Both phases now ALWAYS run and have independent try/catch.
  //
  // TZ NOTE: every timestamp here is computed via `new Date()` (UTC) and
  // stored in TIMESTAMPTZ columns. Postgres normalizes TIMESTAMPTZ to UTC
  // on write. Display-side TZ conversion happens in the React layer.
  // ──────────────────────────────────────────────────────────────────

  const tickStartedAt = new Date().toISOString();
  console.log(`[scheduled-actions] tick start ${tickStartedAt}`);

  const tickSummary = {
    tickStartedAt,
    scheduledActionsProcessed: 0,
    scheduledActionsSuccess: 0,
    scheduledActionsFailed: 0,
    recurringTasksConsidered: 0,
    recurringTasksRenewed: 0,
    recurringTasksCompleted: 0,
    recurringTasksFailed: 0,
    phaseErrors: [] as Array<{ phase: string; message: string }>,
  };

  const results: Array<{ actionId: string; success: boolean; message: string }> = [];

  // ── PHASE A: Drain due scheduled_actions ──────────────────────────
  try {
    // Fetch due scheduled actions
    // `new Date().toISOString()` is always UTC; `.lte('scheduled_for', now)`
    // compares against UTC since the column is TIMESTAMPTZ.
    const now = new Date().toISOString();
    const { data: scheduledActions, error: fetchError } = await supabase
      .from('scheduled_actions')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .limit(50);

    if (fetchError) {
      console.error('Error fetching scheduled actions:', fetchError);
      throw fetchError;
    }

    if (!scheduledActions || scheduledActions.length === 0) {
      console.log('[scheduled-actions] phase A: no scheduled actions due');
    } else {
      console.log(`[scheduled-actions] phase A: ${scheduledActions.length} due`);
      tickSummary.scheduledActionsProcessed = scheduledActions.length;

      for (const scheduledAction of scheduledActions as ScheduledAction[]) {
        // Mark as running
        await supabase
          .from('scheduled_actions')
          .update({ status: 'running' })
          .eq('id', scheduledAction.id);

        const firedAt = new Date();
        const scheduledForMs = new Date(scheduledAction.scheduled_for).getTime();
        const driftSeconds = (firedAt.getTime() - scheduledForMs) / 1000;

        try {
          const result = await executeAction(
            scheduledAction.action,
            scheduledAction.trigger_data,
            supabase
          );

          // Mark as completed (capture firing time + drift for observability)
          await supabase
            .from('scheduled_actions')
            .update({
              status: 'completed',
              executed_at: firedAt.toISOString(),
              fired_at: firedAt.toISOString(),
              drift_seconds: driftSeconds,
              result: result as unknown as Record<string, unknown>,
            })
            .eq('id', scheduledAction.id);

          // Append result to the parent workflow run
          await updateWorkflowRunWithDelayedResult(
            supabase,
            scheduledAction.workflow_run_id,
            result
          );

          results.push({
            actionId: scheduledAction.action.id,
            success: result.success,
            message: result.message,
          });
          if (result.success) tickSummary.scheduledActionsSuccess++;
          else tickSummary.scheduledActionsFailed++;

          console.log(
            `[scheduled-actions] action ${scheduledAction.id} ${result.success ? '✓' : '✗'} drift=${driftSeconds.toFixed(1)}s`
          );
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          const errStack = error instanceof Error ? error.stack || null : null;
          console.error(`[scheduled-actions] action ${scheduledAction.id} threw:`, errMsg);

          await supabase
            .from('scheduled_actions')
            .update({
              status: 'failed',
              error_message: errMsg,
              error_stack: errStack,
              fired_at: firedAt.toISOString(),
              drift_seconds: driftSeconds,
            })
            .eq('id', scheduledAction.id);

          results.push({ actionId: scheduledAction.action.id, success: false, message: errMsg });
          tickSummary.scheduledActionsFailed++;
        }
      }
    }
  } catch (phaseAError) {
    const msg = phaseAError instanceof Error ? phaseAError.message : 'Unknown phase A error';
    console.error('[scheduled-actions] phase A fatal:', msg);
    tickSummary.phaseErrors.push({ phase: 'scheduled_actions', message: msg });
    // DO NOT return — phase B must still run.
  }

  // ── PHASE B: Renew recurring wf_tasks (the previously dead path) ──
  try {
    const now = new Date().toISOString();
    console.log('[recurring-tasks] Checking for due recurring tasks...');
    const { data: dueTasks, error: recurError } = await supabase
      .from('wf_tasks')
      .select('*')
      .eq('is_recurring', true)
      .eq('status', 'open')
      .lte('due_at', now)
      .limit(100);

    if (recurError) {
      console.error('[recurring-tasks] Fetch error:', recurError);
      throw recurError;
    }

    tickSummary.recurringTasksConsidered = dueTasks?.length ?? 0;

    if (dueTasks && dueTasks.length > 0) {
      console.log(`[recurring-tasks] Found ${dueTasks.length} due recurring tasks`);

      for (const task of dueTasks) {
        // Per-task try/catch so one bad task can't kill the whole batch
        try {
          const dealId = task.deal_id;

          // Fetch associated deal (try wf_deals first, then deals)
          let deal: Record<string, unknown> | null = null;
          const { data: wfDeal } = await supabase
            .from('wf_deals')
            .select('*')
            .eq('id', dealId)
            .maybeSingle();

          if (wfDeal) {
            deal = wfDeal;
          } else {
            const { data: mainDeal } = await supabase
              .from('deals')
              .select('*')
              .eq('id', dealId)
              .maybeSingle();
            deal = mainDeal;
          }

          if (!deal) {
            console.log(`[recurring-tasks] task=${task.id} deal=${dealId} missing → completing`);
            await supabase.from('wf_tasks').update({ status: 'done' }).eq('id', task.id);
            tickSummary.recurringTasksCompleted++;
            continue;
          }

          // Evaluate stop conditions
          const stopConditions: StopCondition[] | null = task.recurrence_stop_conditions;

          if (evaluateStopConditions(stopConditions, task, deal)) {
            console.log(`[recurring-tasks] task=${task.id} "${task.title}" stop-cond met → completing`);
            await supabase.from('wf_tasks').update({ status: 'done' }).eq('id', task.id);
            await supabase.from('deals').update({ next_follow_up_at: null }).eq('id', dealId);
            await supabase.from('wf_deals').update({ next_follow_up_at: null }).eq('id', dealId);
            tickSummary.recurringTasksCompleted++;
            continue;
          }

          // No stop condition met → create next occurrence.
          // TZ: Date.now() is UTC ms; * 86_400_000 ms/day; result is UTC ISO.
          const recurrenceRule = task.recurrence_rule_json as Record<string, unknown> | null;
          const intervalDays = (recurrenceRule?.interval as number) || 3;
          const newDueAt = new Date(Date.now() + intervalDays * 86400000).toISOString();

          console.log(`[recurring-tasks] task=${task.id} renewing → due ${newDueAt}`);

          const { error: insertErr } = await supabase.from('wf_tasks').insert({
            deal_id: task.deal_id,
            title: task.title,
            description: task.description,
            status: 'open',
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

          if (insertErr) {
            console.error(`[recurring-tasks] task=${task.id} insert renewal failed:`, insertErr);
            tickSummary.recurringTasksFailed++;
            continue;
          }

          // Complete old task
          await supabase.from('wf_tasks').update({ status: 'done' }).eq('id', task.id);

          // Update next_follow_up_at on the deal
          await supabase.from('deals').update({ next_follow_up_at: newDueAt }).eq('id', dealId);
          await supabase.from('wf_deals').update({ next_follow_up_at: newDueAt }).eq('id', dealId);

          // Audit-log renewal
          await supabase.from('wf_workflows_log').insert({
            workflow_name: `recurring_renewal_${task.workflow_key || 'unknown'}`,
            trigger_type: 'stage_change',
            deal_id: dealId,
            org_company_id: task.org_company_id,
            metadata_json: {
              action: 'recurring_renewal',
              old_task_id: task.id,
              new_due_at: newDueAt,
              interval_days: intervalDays,
              tick_started_at: tickStartedAt,
            },
          });

          tickSummary.recurringTasksRenewed++;
          results.push({ actionId: task.id, success: true, message: `Recurring task "${task.title}" renewed` });
        } catch (perTaskErr) {
          const msg = perTaskErr instanceof Error ? perTaskErr.message : 'Unknown error';
          console.error(`[recurring-tasks] task=${task.id} unhandled:`, msg);
          tickSummary.recurringTasksFailed++;
        }
      }
    }
  } catch (phaseBError) {
    const msg = phaseBError instanceof Error ? phaseBError.message : 'Unknown phase B error';
    console.error('[recurring-tasks] phase B fatal:', msg);
    tickSummary.phaseErrors.push({ phase: 'recurring_tasks', message: msg });
  }

  console.log(
    `[scheduled-actions] tick done: scheduled=${tickSummary.scheduledActionsProcessed} ` +
    `(✓${tickSummary.scheduledActionsSuccess} ✗${tickSummary.scheduledActionsFailed}) ` +
    `recurring=${tickSummary.recurringTasksConsidered} ` +
    `(renewed ${tickSummary.recurringTasksRenewed}, completed ${tickSummary.recurringTasksCompleted}, ` +
    `failed ${tickSummary.recurringTasksFailed}) ` +
    `phaseErrors=${tickSummary.phaseErrors.length}`
  );

  const successCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;

  // Only email admins when there are FAILURES to report (avoid noisy success emails on every tick)
  if (failedCount > 0) {
    await sendWorkflowSummaryEmail(supabase, results, successCount, failedCount);
  }

  return new Response(JSON.stringify(tickSummary), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

async function executeAction(
  action: { id: string; type: string; config: Record<string, any> },
  triggerData: Record<string, any>,
  supabase: any
): Promise<ActionResult> {
  const { type, config, id } = action;

  switch (type) {
    case 'send_notification':
      return await sendNotification(id, config, triggerData, supabase);
    case 'send_email':
      return await sendEmail(id, config, triggerData, supabase);
    case 'webhook':
      return await callWebhook(id, config, triggerData);
    case 'update_field':
      return await updateDealField(id, config, triggerData, supabase);
    case 'trigger_workflow':
      return await triggerChainedWorkflow(id, config, triggerData, supabase);
    default:
      return { actionId: id, type, success: false, message: `Unknown action type: ${type}` };
  }
}

async function sendNotification(
  actionId: string,
  config: Record<string, any>,
  triggerData: Record<string, any>,
  supabase: any
): Promise<ActionResult> {
  try {
    const title = replaceVariables(config.title || 'Workflow Notification', triggerData);
    const message = replaceVariables(config.message || 'A workflow action was triggered', triggerData);

    console.log(`[Delayed Notification] Title: ${title}, Message: ${message}`);

    // If we have a user ID, create an in-app notification
    if (triggerData.userId) {
      await supabase.from('flex_notifications').insert({
        user_id: triggerData.userId,
        deal_id: triggerData.dealId || '00000000-0000-0000-0000-000000000000',
        alert_type: 'workflow',
        title: title,
        message: message,
      });
    }

    return { actionId, type: 'send_notification', success: true, message: `Delayed notification sent: ${title}` };
  } catch (error) {
    return { actionId, type: 'send_notification', success: false, message: error instanceof Error ? error.message : 'Failed to send notification' };
  }
}

async function sendEmail(
  actionId: string,
  config: Record<string, any>,
  triggerData: Record<string, any>,
  supabase: any
): Promise<ActionResult> {
  try {
    const subject = replaceVariables(config.subject || 'Workflow Email', triggerData);
    const body = replaceVariables(config.body || 'A workflow action was triggered', triggerData);
    const toEmail = config.to || triggerData.userEmail;

    if (!toEmail) {
      return { actionId, type: 'send_email', success: false, message: 'No recipient email specified' };
    }

    // Suppress workflow follow-up reminder emails for jturner@5thline.co.
    // These reminders are surfaced in the in-app Daily Briefing
    // ("Today's Follow-Ups") instead. Underlying scheduled actions and
    // task records remain intact — only email delivery is suppressed.
    if (typeof toEmail === 'string' && toEmail.toLowerCase() === 'jturner@5thline.co') {
      console.log(`[Delayed Email] Suppressed jturner@5thline.co reminder (subject="${subject}") — surfaced in Daily Briefing instead`);
      return { actionId, type: 'send_email', success: true, message: `Suppressed jturner reminder email (in-app Daily Briefing)` };
    }

    console.log(`[Delayed Email] Sending to ${toEmail}, Subject: ${subject}`);

    // Use Resend to send email
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: buildFrom("naitive"),
          to: [toEmail],
          subject: subject,
          html: `<p>${body}</p><p style="color: #888; font-size: 12px; margin-top: 20px;">This is a delayed automated email from your workflow.</p>`,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Resend error:', errorText);
        return { actionId, type: 'send_email', success: false, message: `Email failed: ${response.statusText}` };
      }
    }

    return { actionId, type: 'send_email', success: true, message: `Delayed email sent to ${toEmail}` };
  } catch (error) {
    return { actionId, type: 'send_email', success: false, message: error instanceof Error ? error.message : 'Failed to send email' };
  }
}

async function callWebhook(
  actionId: string,
  config: Record<string, any>,
  triggerData: Record<string, any>
): Promise<ActionResult> {
  try {
    const url = config.url;
    if (!url) {
      console.log(`[Delayed Webhook] Skipped: no URL configured (non-blocking)`);
      return { actionId, type: 'webhook', success: true, message: 'Skipped: no webhook URL configured' };
    }

    console.log(`[Delayed Webhook] Calling ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers || {}),
      },
      body: JSON.stringify({
        event: 'delayed_workflow_action',
        timestamp: new Date().toISOString(),
        data: triggerData,
      }),
    });

    if (!response.ok) {
      return { actionId, type: 'webhook', success: false, message: `Webhook returned ${response.status}` };
    }

    return { actionId, type: 'webhook', success: true, message: `Delayed webhook called: ${url}` };
  } catch (error) {
    return { actionId, type: 'webhook', success: false, message: error instanceof Error ? error.message : 'Webhook failed' };
  }
}

async function updateDealField(
  actionId: string,
  config: Record<string, any>,
  triggerData: Record<string, any>,
  supabase: any
): Promise<ActionResult> {
  try {
    const dealId = triggerData.dealId;
    if (!dealId || dealId === 'test-deal-id') {
      return { actionId, type: 'update_field', success: true, message: 'Delayed field update skipped (test mode)' };
    }

    const field = config.field;
    const value = replaceVariables(config.value, triggerData);

    if (!field) {
      return { actionId, type: 'update_field', success: false, message: 'No field specified' };
    }

    const updateData: Record<string, any> = { [field]: value };
    
    const { error } = await supabase
      .from('deals')
      .update(updateData)
      .eq('id', dealId);

    if (error) throw error;

    return { actionId, type: 'update_field', success: true, message: `Delayed field ${field} updated` };
  } catch (error) {
    return { actionId, type: 'update_field', success: false, message: error instanceof Error ? error.message : 'Failed to update field' };
  }
}

async function triggerChainedWorkflow(
  actionId: string,
  config: Record<string, any>,
  triggerData: Record<string, any>,
  supabase: any
): Promise<ActionResult> {
  try {
    const targetWorkflowId = config.workflowId;
    if (!targetWorkflowId) {
      return { actionId, type: 'trigger_workflow', success: false, message: 'No target workflow specified' };
    }

    // Fetch the target workflow
    const { data: workflow, error: fetchError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', targetWorkflowId)
      .eq('is_active', true)
      .single();

    if (fetchError || !workflow) {
      return { actionId, type: 'trigger_workflow', success: false, message: 'Target workflow not found or inactive' };
    }

    // Call execute-workflow for the chained workflow
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const response = await fetch(`${supabaseUrl}/functions/v1/execute-workflow`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflowId: workflow.id,
        triggerType: 'chained',
        triggerData: {
          ...triggerData,
          chainedFrom: actionId,
          isChained: true,
        },
        actions: workflow.actions,
      }),
    });

    if (!response.ok) {
      return { actionId, type: 'trigger_workflow', success: false, message: `Chained workflow failed: ${response.statusText}` };
    }

    return { actionId, type: 'trigger_workflow', success: true, message: `Delayed chained workflow ${workflow.name} triggered` };
  } catch (error) {
    return { actionId, type: 'trigger_workflow', success: false, message: error instanceof Error ? error.message : 'Failed to trigger chained workflow' };
  }
}

async function updateWorkflowRunWithDelayedResult(
  supabase: any,
  workflowRunId: string,
  result: ActionResult
): Promise<void> {
  try {
    // Fetch current run to append result
    const { data: run, error } = await supabase
      .from('workflow_runs')
      .select('results')
      .eq('id', workflowRunId)
      .single();

    if (error || !run) {
      console.error('Could not find workflow run to update:', workflowRunId);
      return;
    }

    const existingResults = run.results || [];
    const updatedResults = [...existingResults, result];

    await supabase
      .from('workflow_runs')
      .update({ results: updatedResults })
      .eq('id', workflowRunId);

  } catch (error) {
    console.error('Error updating workflow run with delayed result:', error);
  }
}

function replaceVariables(text: string, data: Record<string, any>): string {
  if (!text) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return data[key] !== undefined ? String(data[key]) : `{{${key}}}`;
  });
}

async function sendWorkflowSummaryEmail(
  supabase: any,
  results: Array<{ actionId: string; success: boolean; message: string }>,
  successCount: number,
  failedCount: number
): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.log('No RESEND_API_KEY configured, skipping summary email');
    return;
  }

  try {
    // Get admin users to notify (users with admin role)
    const { data: adminUsers, error: adminError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (adminError || !adminUsers || adminUsers.length === 0) {
      console.log('No admin users found to notify');
      return;
    }

    // Get admin emails
    const adminEmails: string[] = [];
    for (const admin of adminUsers) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('user_id', admin.user_id)
        .single();
      
      if (profile?.email) {
        adminEmails.push(profile.email);
      }
    }

    if (adminEmails.length === 0) {
      console.log('No admin emails found');
      return;
    }

    const hasFailures = failedCount > 0;
    const status = hasFailures ? 'with issues' : 'successfully';
    const statusEmoji = hasFailures ? '⚠️' : '✅';

    const failedActions = results.filter(r => !r.success);
    const failedDetails = failedActions.length > 0
      ? `<div style="margin-top: 16px; padding: 12px; background: #FEF2F2; border-radius: 6px; border-left: 4px solid #EF4444;">
          <p style="color: #991B1B; font-weight: 600; margin: 0 0 8px 0;">Failed Actions:</p>
          ${failedActions.map(a => `<p style="color: #7F1D1D; margin: 4px 0; font-size: 14px;">• ${a.message}</p>`).join('')}
        </div>`
      : '';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
        body: JSON.stringify({
          from: buildFrom("naitive"),
          to: adminEmails,
          subject: `${statusEmoji} Workflow Actions Processed ${status}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Workflow Summary</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px;">
            <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 8px; padding: 32px;">
              <h1 style="color: #1a1a1a; font-size: 20px; margin: 0 0 16px 0;">
                ${statusEmoji} Scheduled Workflow Actions Processed
              </h1>
              
              <div style="display: flex; gap: 16px; margin-bottom: 20px;">
                <div style="flex: 1; padding: 16px; background: #F0FDF4; border-radius: 8px; text-align: center;">
                  <p style="color: #166534; font-size: 24px; font-weight: 700; margin: 0;">${successCount}</p>
                  <p style="color: #166534; font-size: 12px; margin: 4px 0 0 0;">Successful</p>
                </div>
                <div style="flex: 1; padding: 16px; background: ${failedCount > 0 ? '#FEF2F2' : '#F3F4F6'}; border-radius: 8px; text-align: center;">
                  <p style="color: ${failedCount > 0 ? '#991B1B' : '#6B7280'}; font-size: 24px; font-weight: 700; margin: 0;">${failedCount}</p>
                  <p style="color: ${failedCount > 0 ? '#991B1B' : '#6B7280'}; font-size: 12px; margin: 4px 0 0 0;">Failed</p>
                </div>
              </div>

              ${failedDetails}

              <p style="color: #6B7280; font-size: 12px; margin-top: 24px; text-align: center;">
                This is an automated notification from your workflow system.
              </p>
            </div>
          </body>
          </html>
        `,
      }),
    });

    if (!response.ok) {
      console.error('Failed to send workflow summary email:', await response.text());
    } else {
      console.log('Workflow summary email sent to', adminEmails.length, 'admins');
    }
  } catch (error) {
    console.error('Error sending workflow summary email:', error);
  }
}
