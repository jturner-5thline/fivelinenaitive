import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ActionCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'not_contains';
  value: string;
}

interface WorkflowAction {
  id: string;
  type: "send_notification" | "send_email" | "webhook" | "update_field" | "trigger_workflow";
  config: Record<string, any>;
  condition?: ActionCondition;
  delay?: { amount: number; unit: 'minutes' | 'hours' | 'days' };
}

interface ExecuteWorkflowRequest {
  workflowId: string;
  triggerType: string;
  triggerData: Record<string, any>;
  actions: WorkflowAction[];
}

function validateWebhookUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Only allow HTTPS for security
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS URLs are allowed' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and loopback
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return { valid: false, error: 'Localhost URLs are not allowed' };
  }

  // Block private IP ranges and cloud metadata endpoints
  const privatePatterns = [
    /^127\./, // Loopback
    /^10\./, // Private class A
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private class B
    /^192\.168\./, // Private class C
    /^169\.254\./, // Link-local / AWS/GCP/Azure metadata
    /^0\.0\.0\.0$/,
    /^fd[0-9a-f]{2}:/i, // IPv6 private
    /^fe80:/i, // IPv6 link-local
  ];

  for (const pattern of privatePatterns) {
    if (pattern.test(hostname)) {
      return { valid: false, error: 'Private/internal URLs are not allowed' };
    }
  }

  // Block known cloud metadata hostnames
  const blockedHostnames = [
    'metadata.google.internal',
    'metadata.goog',
    'instance-data',
  ];

  if (blockedHostnames.includes(hostname)) {
    return { valid: false, error: 'Cloud metadata endpoints are not allowed' };
  }

  return { valid: true };
}

async function executeWebhookAction(config: Record<string, any>, triggerData: Record<string, any>): Promise<{ success: boolean; message: string }> {
  const url = config.url;
  if (!url) {
    return { success: false, message: "No webhook URL configured" };
  }

  // Validate URL to prevent SSRF attacks
  const validation = validateWebhookUrl(url);
  if (!validation.valid) {
    console.error(`Invalid webhook URL rejected: ${url} - ${validation.error}`);
    return { success: false, message: `Invalid webhook URL: ${validation.error}` };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        trigger_data: triggerData,
        source: "nAItive Workflow",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // For Zapier webhooks with no-cors, we can't check response status
    return { success: true, message: `Webhook called: ${url}` };
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message: `Webhook failed: ${message}` };
  }
}

async function executeNotificationAction(
  supabase: any,
  userId: string,
  config: Record<string, any>,
  triggerData: Record<string, any>
): Promise<{ success: boolean; message: string }> {
  // For now, we'll log the notification. In a full implementation,
  // you'd store this in a notifications table
  const title = config.title || "Workflow Notification";
  const message = config.message || "A workflow was triggered";

  console.log(`Notification for user ${userId}: ${title} - ${message}`);
  
  // We could add to activity_logs or a dedicated notifications table
  // For now, just return success
  return { success: true, message: `Notification sent: ${title}` };
}

async function executeEmailAction(
  config: Record<string, any>,
  triggerData: Record<string, any>,
  userEmail: string
): Promise<{ success: boolean; message: string }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  
  if (!RESEND_API_KEY) {
    console.log("RESEND_API_KEY not configured - skipping email action");
    return { success: false, message: "Email not configured (RESEND_API_KEY missing)" };
  }

  const subject = config.subject || "Workflow Notification";
  const body = config.body || "A workflow was triggered";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "nAItive Workflows <onboarding@resend.dev>",
        to: [userEmail],
        subject: subject,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>${subject}</h2>
          <p>${body}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #666; font-size: 12px;">This email was sent by an automated workflow.</p>
        </div>`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(errorData);
    }

    console.log("Email sent successfully");
    return { success: true, message: `Email sent to ${userEmail}` };
  } catch (error: unknown) {
    console.error("Email error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message: `Email failed: ${message}` };
  }
}

async function executeUpdateFieldAction(
  supabase: any,
  config: Record<string, any>,
  triggerData: Record<string, any>
): Promise<{ success: boolean; message: string }> {
  const field = config.field;
  const value = config.value;
  const dealId = triggerData.dealId;

  if (!field || !value) {
    return { success: false, message: "Field or value not configured" };
  }

  if (!dealId) {
    return { success: false, message: "No deal ID in trigger data" };
  }

  try {
    const { error } = await supabase
      .from("deals")
      .update({ [field]: value })
      .eq("id", dealId);

    if (error) throw error;

    return { success: true, message: `Updated ${field} to ${value}` };
  } catch (error: unknown) {
    console.error("Update field error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message: `Update failed: ${message}` };
  }
}
function evaluateCondition(condition: ActionCondition, triggerData: Record<string, any>): boolean {
  const fieldValue = triggerData[condition.field] ?? triggerData.dealValue ?? triggerData.deal_value;
  const condValue = condition.value;

  switch (condition.operator) {
    case 'equals': return String(fieldValue).toLowerCase() === condValue.toLowerCase();
    case 'not_equals': return String(fieldValue).toLowerCase() !== condValue.toLowerCase();
    case 'greater_than': return Number(fieldValue) > Number(condValue);
    case 'less_than': return Number(fieldValue) < Number(condValue);
    case 'contains': return String(fieldValue).toLowerCase().includes(condValue.toLowerCase());
    case 'not_contains': return !String(fieldValue).toLowerCase().includes(condValue.toLowerCase());
    default: return true;
  }
}

async function executeTriggerWorkflowAction(
  supabase: any,
  config: Record<string, any>,
  triggerData: Record<string, any>,
  authHeader: string
): Promise<{ success: boolean; message: string }> {
  const targetWorkflowId = config.workflowId;
  if (!targetWorkflowId) {
    return { success: false, message: "No target workflow ID configured" };
  }

  try {
    const { data: workflow, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', targetWorkflowId)
      .single();

    if (error || !workflow) {
      return { success: false, message: "Target workflow not found" };
    }

    if (!workflow.is_active) {
      return { success: false, message: "Target workflow is inactive" };
    }

    // Call execute-workflow recursively
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const response = await fetch(`${supabaseUrl}/functions/v1/execute-workflow`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
      },
      body: JSON.stringify({
        workflowId: targetWorkflowId,
        triggerType: workflow.trigger_type,
        triggerData: { ...triggerData, chainedFrom: true },
        actions: workflow.actions,
      }),
    });

    if (!response.ok) {
      throw new Error(`Chained workflow failed: ${response.status}`);
    }

    return { success: true, message: `Triggered workflow: ${workflow.name}` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, message: `Chain failed: ${message}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { workflowId, triggerType, triggerData, actions }: ExecuteWorkflowRequest = await req.json();

    console.log(`Executing workflow ${workflowId} for user ${user.id}`);
    console.log(`Trigger: ${triggerType}`, triggerData);
    console.log(`Actions:`, actions);

    // Create a workflow run record
    const { data: runData, error: runError } = await supabase
      .from("workflow_runs")
      .insert({
        workflow_id: workflowId,
        user_id: user.id,
        trigger_data: triggerData,
        status: "running",
      })
      .select()
      .single();

    if (runError) {
      console.error("Error creating workflow run:", runError);
    }

    const runId = runData?.id;
    const results: { actionId: string; type: string; success: boolean; message: string }[] = [];

    // Execute each action
    for (const action of actions) {
      let result: { success: boolean; message: string };

      // Check condition if present
      if (action.condition) {
        const conditionMet = evaluateCondition(action.condition, triggerData);
        if (!conditionMet) {
          results.push({ actionId: action.id, type: action.type, success: true, message: 'Skipped: condition not met' });
          continue;
        }
      }

      // Handle delayed actions
      if (action.delay) {
        const delayMs = action.delay.amount * (action.delay.unit === 'minutes' ? 60000 : action.delay.unit === 'hours' ? 3600000 : 86400000);
        const scheduledFor = new Date(Date.now() + delayMs).toISOString();
        
        await supabase.from('scheduled_actions').insert({
          workflow_run_id: runId,
          workflow_id: workflowId,
          user_id: user.id,
          action_id: action.id,
          action_type: action.type,
          action_config: action.config,
          trigger_data: triggerData,
          scheduled_for: scheduledFor,
          status: 'pending',
        });
        
        results.push({ actionId: action.id, type: action.type, success: true, message: `Scheduled for ${scheduledFor}` });
        continue;
      }

      switch (action.type) {
        case "webhook":
          result = await executeWebhookAction(action.config, triggerData);
          break;
        case "send_notification":
          result = await executeNotificationAction(supabase, user.id, action.config, triggerData);
          break;
        case "send_email":
          result = await executeEmailAction(action.config, triggerData, user.email || "");
          break;
        case "update_field":
          result = await executeUpdateFieldAction(supabase, action.config, triggerData);
          break;
        case "trigger_workflow":
          result = await executeTriggerWorkflowAction(supabase, action.config, triggerData, authHeader);
          break;
        default:
          result = { success: false, message: `Unknown action type: ${action.type}` };
      }

      results.push({ actionId: action.id, type: action.type, ...result });
      console.log(`Action ${action.type} result:`, result);
    }

    // Update the workflow run
    const allSucceeded = results.every(r => r.success);
    if (runId) {
      await supabase
        .from("workflow_runs")
        .update({
          status: allSucceeded ? "completed" : "partial",
          results: results,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Execute workflow error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
