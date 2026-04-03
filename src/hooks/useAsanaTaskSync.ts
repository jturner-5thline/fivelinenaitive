import { supabase } from '@/integrations/supabase/client';

interface AsanaSyncContext {
  integrationId: string;
  workspaceGid: string;
  projectGid: string | null;
  sectionGid: string | null;
}

/**
 * Check if a connected Asana integration exists for the user's company
 * and if sync_on_task_create is enabled.
 * Returns sync context if ready, or null if sync should be skipped.
 */
export async function getAsanaSyncContext(companyId: string | null): Promise<AsanaSyncContext | null> {
  if (!companyId) return null;

  // 1. Find a connected Asana integration for this company
  const { data: integration } = await supabase
    .from('integrations')
    .select('id, config')
    .eq('type', 'asana')
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle();

  if (!integration) return null;

  // 2. Check if sync_on_task_create is enabled
  const { data: syncConfig } = await supabase
    .from('asana_sync_config')
    .select('id, sync_on_task_create')
    .eq('integration_id', integration.id)
    .maybeSingle();

  if (!syncConfig?.sync_on_task_create) return null;

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

  return {
    integrationId: integration.id,
    workspaceGid,
    projectGid: projectFilter?.asana_project_gid || null,
    sectionGid: (projectFilter as any)?.asana_section_gid || null,
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
      taskData.due_on = task.due_date;
    }

    if (assigneeGid) {
      taskData.assignee = assigneeGid;
    }

    if (ctx.projectGid && ctx.sectionGid) {
      taskData.memberships = [{ project: ctx.projectGid, section: ctx.sectionGid }];
    } else if (ctx.projectGid) {
      taskData.projects = [ctx.projectGid];
    } else {
      taskData.workspace = ctx.workspaceGid;
    }

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
