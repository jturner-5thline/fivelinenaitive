import { supabase } from "@/integrations/supabase/client";

// Types
export type WfOwnerRole = 'manager' | 'analyst' | 'ops' | 'system';
export type WfTriggerType = 'stage_change' | 'calendar_event' | 'email_event' | 'manual' | 'external';

export interface WorkflowConfig {
  key: string;
  name: string;
  description?: string;
  trigger: WfTriggerType;
  triggerFilter?: {
    from_stage?: string;
    to_stage?: string;
  };
  default_owner_role: WfOwnerRole;
  default_owner_user_id?: string;
  handler: (deal: any, context: WorkflowContext) => Promise<void>;
}

export interface WorkflowContext {
  workflowOwnerId: string | null;
  companyId: string | null;
  triggeredBy: WfTriggerType;
  metadata?: Record<string, any>;
}

// Registry
const workflowRegistry = new Map<string, WorkflowConfig>();

export function registerWorkflow(key: string, config: WorkflowConfig) {
  workflowRegistry.set(key, config);
}

export function getRegisteredWorkflows(): WorkflowConfig[] {
  return Array.from(workflowRegistry.values());
}

export function getWorkflow(key: string): WorkflowConfig | undefined {
  return workflowRegistry.get(key);
}

// Resolve owner
export async function resolveWorkflowOwner(
  workflowKey: string,
  deal: any,
  companyId: string | null
): Promise<string | null> {
  // Check if a specific user is set in the DB
  const { data: wfRow } = await supabase
    .from('wf_workflows')
    .select('default_owner_user_id, default_owner_role')
    .eq('key', workflowKey)
    .maybeSingle();

  if (wfRow?.default_owner_user_id) return wfRow.default_owner_user_id;

  const config = workflowRegistry.get(workflowKey);
  const role = wfRow?.default_owner_role || config?.default_owner_role || 'manager';

  switch (role) {
    case 'manager': return deal?.manager_id || null;
    case 'analyst': return deal?.analyst_id || null;
    case 'ops': return deal?.ops_id || null;
    case 'system': return null;
    default: return null;
  }
}

// Run workflow
export async function runWorkflow(
  workflowKey: string,
  deal: any,
  triggerType: WfTriggerType,
  metadata?: Record<string, any>
) {
  const config = workflowRegistry.get(workflowKey);
  if (!config) {
    console.warn(`Workflow ${workflowKey} not registered`);
    return;
  }

  const companyId = deal?.org_company_id || null;
  const ownerId = await resolveWorkflowOwner(workflowKey, deal, companyId);

  // Log the run
  await supabase.from('wf_workflows_log').insert({
    workflow_name: config.name,
    owner_user_id: ownerId,
    trigger_type: triggerType,
    deal_id: deal?.id || null,
    org_company_id: companyId,
    metadata_json: metadata || {},
  });

  // Execute handler
  const context: WorkflowContext = {
    workflowOwnerId: ownerId,
    companyId,
    triggeredBy: triggerType,
    metadata,
  };

  try {
    await config.handler(deal, context);
  } catch (err) {
    console.error(`Workflow ${workflowKey} failed:`, err);
  }
}

// Helper to create a workflow task
export async function createWorkflowTask(params: {
  dealId: string;
  title: string;
  description?: string;
  assigneeId?: string | null;
  workflowOwnerId?: string | null;
  workflowKey?: string;
  triggerSource?: string;
  isRecurring?: boolean;
  recurrenceRuleJson?: any;
  dueOffsetDays?: number;
  companyId?: string | null;
}) {
  const dueAt = params.dueOffsetDays
    ? new Date(Date.now() + params.dueOffsetDays * 86400000).toISOString()
    : undefined;

  return supabase.from('wf_tasks').insert({
    deal_id: params.dealId,
    title: params.title,
    description: params.description,
    assignee_id: params.assigneeId,
    created_by_id: params.workflowOwnerId,
    workflow_owner_id: params.workflowOwnerId,
    workflow_key: params.workflowKey,
    trigger_source: (params.triggerSource || 'stage_change') as any,
    is_recurring: params.isRecurring || false,
    recurrence_rule_json: params.recurrenceRuleJson,
    due_at: dueAt,
    org_company_id: params.companyId,
    status: 'open',
  });
}
