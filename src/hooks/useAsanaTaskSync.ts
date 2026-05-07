import { supabase } from '@/integrations/supabase/client';

/**
 * Record an Asana sync attempt to the asana_sync_log table for the
 * admin error/audit log. Best-effort: a logging failure must never
 * mask the real sync result.
 */
async function logSyncAttempt(entry: {
  task_id?: string | null;
  asana_task_gid?: string | null;
  action: string;
  success: boolean;
  error_message?: string | null;
  payload?: unknown;
  company_id?: string | null;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('asana_sync_log' as any).insert({
      task_id: entry.task_id || null,
      asana_task_gid: entry.asana_task_gid || null,
      action: entry.action,
      success: entry.success,
      error_message: entry.error_message || null,
      payload: entry.payload ? (entry.payload as any) : null,
      company_id: entry.company_id || null,
      triggered_by: user?.id || null,
    } as any);
  } catch (e) {
    console.warn('[AsanaSync] Failed to write sync log:', e);
  }
}

interface AsanaSyncContext {
  integrationId: string;
  workspaceGid: string;
  projectGid: string | null;
  sectionGid: string | null;
  companyId?: string | null;
}

/**
 * Check if a connected Asana integration exists for the user's company
 * and if sync_on_task_create is enabled.
 * Returns sync context if ready, or null if sync should be skipped.
 */
export async function getAsanaSyncContext(companyId: string | null): Promise<AsanaSyncContext | null> {
  if (!companyId) {
    console.warn('[AsanaSync] No companyId provided, skipping sync');
    return null;
  }

  // 1. Find a connected Asana integration for this company
  const { data: integration, error: intError } = await supabase
    .from('integrations')
    .select('id, config')
    .eq('type', 'asana')
    .eq('status', 'connected')
    .eq('company_id', companyId)
    .limit(1)
    .maybeSingle();

  if (intError) {
    console.error('[AsanaSync] Integration lookup error:', intError);
    return null;
  }

  if (!integration) {
    console.warn('[AsanaSync] No connected Asana integration found for company:', companyId);
    return null;
  }

  console.log('[AsanaSync] Found integration:', integration.id);

  // 2. Check if sync_on_task_create is enabled
  const { data: syncConfig } = await supabase
    .from('asana_sync_config')
    .select('id, sync_on_task_create')
    .eq('integration_id', integration.id)
    .maybeSingle();

  if (!syncConfig?.sync_on_task_create) {
    console.warn('[AsanaSync] sync_on_task_create is disabled or no sync config found');
    return null;
  }

  // 3. Get workspace GID from integration config
  const config = integration.config as Record<string, string>;
  const workspaceGid = config?.workspace_gid;
  if (!workspaceGid) return null;

  // 4. Get first enabled project filter for this sync config
  const { data: projectFilter } = await supabase
    .from('asana_project_filters')
    .select('asana_project_gid, asana_section_gid')
    .eq('sync_config_id', syncConfig.id)
    .eq('is_enabled', true)
    .limit(1)
    .maybeSingle();

  const sectionGid: string | null = projectFilter?.asana_section_gid || null;

  return {
    integrationId: integration.id,
    workspaceGid,
    projectGid: projectFilter?.asana_project_gid || null,
    sectionGid,
  };
}

/**
 * Find an Asana user GID by email using the workspace_users action.
 */
async function findAsanaUserByEmail(
  integrationId: string,
  workspaceGid: string,
  email: string
): Promise<string | null> {
  try {
    const { data } = await supabase.functions.invoke('asana-proxy', {
      body: {
        action: 'workspace_users',
        integration_id: integrationId,
        workspace_gid: workspaceGid,
      },
    });

    if (!data?.success || !Array.isArray(data.users)) return null;

    const match = data.users.find(
      (u: { email?: string; gid?: string }) =>
        u.email?.toLowerCase() === email.toLowerCase()
    );

    return match?.gid || null;
  } catch (e) {
    console.error('Asana user lookup failed:', e);
    return null;
  }
}

/**
 * Sync a newly created naitive task to Asana.
 * Returns the Asana task GID if successful.
 */
export async function syncTaskToAsana(
  ctx: AsanaSyncContext,
  task: {
    id: string;
    title: string;
    description?: string | null;
    due_date?: string | null;
    assignee_email?: string | null;
  }
): Promise<string | null> {
  try {
    // Look up Asana user by email
    let assigneeGid: string | null = null;
    if (task.assignee_email) {
      assigneeGid = await findAsanaUserByEmail(
        ctx.integrationId,
        ctx.workspaceGid,
        task.assignee_email
      );
    }

    // Build Asana task payload
    const taskData: Record<string, unknown> = {
      name: task.title,
      notes: task.description || '',
    };

    if (task.due_date) {
      // Ensure YYYY-MM-DD format for Asana (strip any time/timezone suffix)
      taskData.due_on = task.due_date.substring(0, 10);
    }

    if (assigneeGid) {
      taskData.assignee = assigneeGid;
    }

    // Asana always requires workspace when using memberships
    taskData.workspace = ctx.workspaceGid;

    if (ctx.projectGid && ctx.sectionGid) {
      taskData.memberships = [{ project: ctx.projectGid, section: ctx.sectionGid }];
    } else if (ctx.projectGid) {
      console.warn('[AsanaSync] Warning: No section configured for project, task will be placed in default section');
      taskData.projects = [ctx.projectGid];
    }

    console.log('[AsanaSync] Creating Asana task with payload:', JSON.stringify(taskData));

    const { data } = await supabase.functions.invoke('asana-proxy', {
      body: {
        action: 'create_task',
        integration_id: ctx.integrationId,
        task_data: taskData,
      },
    });

    if (!data?.success || !data.task?.gid) {
      console.error('Asana task creation failed:', data);
      return null;
    }

    const asanaGid = data.task.gid as string;

    // Store the Asana GID back on the naitive task
    await supabase
      .from('tasks')
      .update({ asana_task_gid: asanaGid } as any)
      .eq('id', task.id);

    return asanaGid;
  } catch (e) {
    console.error('Asana task sync failed:', e);
    return null;
  }
}

/**
 * Update an existing Asana task's name, due date, assignee, and/or completion.
 */
export async function updateTaskInAsana(
  ctx: AsanaSyncContext,
  asanaTaskGid: string,
  updates: {
    title?: string | null;
    due_date?: string | null;
    assignee_email?: string | null;
    completed?: boolean;
  }
): Promise<boolean> {
  try {
    const asanaUpdates: Record<string, unknown> = {};

    if ('title' in updates && updates.title) {
      asanaUpdates.name = updates.title;
    }

    if ('due_date' in updates) {
      asanaUpdates.due_on = updates.due_date ? updates.due_date.substring(0, 10) : null;
    }

    if ('assignee_email' in updates) {
      if (updates.assignee_email) {
        const gid = await findAsanaUserByEmail(ctx.integrationId, ctx.workspaceGid, updates.assignee_email);
        asanaUpdates.assignee = gid || null;
      } else {
        asanaUpdates.assignee = null;
      }
    }

    if ('completed' in updates) {
      asanaUpdates.completed = updates.completed;
    }

    if (Object.keys(asanaUpdates).length === 0) return true;

    const { data } = await supabase.functions.invoke('asana-proxy', {
      body: { action: 'update_task', integration_id: ctx.integrationId, task_gid: asanaTaskGid, data: asanaUpdates }
    });

    return data?.success ?? false;
  } catch (e) {
    console.error('Asana task update failed:', e);
    return false;
  }
}
