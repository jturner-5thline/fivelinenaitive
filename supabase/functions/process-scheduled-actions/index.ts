import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  console.log('Processing scheduled actions...');

  try {
    // Fetch due scheduled actions
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
      console.log('No scheduled actions to process');
      return new Response(JSON.stringify({ processed: 0, message: 'No actions due' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${scheduledActions.length} scheduled actions to process`);

    const results: Array<{ actionId: string; success: boolean; message: string }> = [];

    for (const scheduledAction of scheduledActions as ScheduledAction[]) {
      // Mark as running
      await supabase
        .from('scheduled_actions')
        .update({ status: 'running' })
        .eq('id', scheduledAction.id);

      try {
        const result = await executeAction(
          scheduledAction.action,
          scheduledAction.trigger_data,
          supabase
        );

        // Mark as completed
        await supabase
          .from('scheduled_actions')
          .update({ 
            status: 'completed',
            executed_at: new Date().toISOString(),
          })
          .eq('id', scheduledAction.id);

        // Update the workflow run with the delayed action result
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

        console.log(`Executed scheduled action ${scheduledAction.id}: ${result.success ? 'success' : 'failed'}`);

      } catch (error) {
        console.error(`Error executing scheduled action ${scheduledAction.id}:`, error);
        
        // Mark as failed
        await supabase
          .from('scheduled_actions')
          .update({ 
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
          })
          .eq('id', scheduledAction.id);

        results.push({
          actionId: scheduledAction.action.id,
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    // Send summary email notification if there are any results
    if (results.length > 0) {
      await sendWorkflowSummaryEmail(supabase, results, successCount, failedCount);
    }

    return new Response(JSON.stringify({
      processed: scheduledActions.length,
      successful: successCount,
      failed: failedCount,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error processing scheduled actions:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
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
          from: 'nAItive <notifications@resend.dev>',
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
      return { actionId, type: 'webhook', success: false, message: 'No webhook URL configured' };
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
        from: 'nAItive <notifications@resend.dev>',
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
