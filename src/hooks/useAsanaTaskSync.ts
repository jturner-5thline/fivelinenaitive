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
  http_status?: number | null;
  response_body?: unknown;
  attempt_number?: number;
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
      http_status: entry.http_status ?? null,
      response_body: entry.response_body ? (entry.response_body as any) : null,
      attempt_number: entry.attempt_number ?? 1,
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
 * Ensure Asana is firing webhooks back to us for the given project. If a
 * webhook row already exists for (integration_id, project_gid), no-op.
 * Otherwise register one with Asana and persist the row so inbound task
 * changes (completion, due date, assignee, rename) sync back to naitive
 * regardless of which Asana project the task lives in.
 *
 * Best-effort: never throws. A failure here does not fail the outbound
 * task sync — it only means reverse-sync won't fire until the user (or
 * the next task push into this project) retries.
 */
async function ensureAsanaWebhookForProject(
  integrationId: string,
  projectGid: string,
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from('asana_webhooks')
      .select('id, is_active, asana_webhook_gid')
      .eq('integration_id', integrationId)
      .eq('asana_project_gid', projectGid)
      .maybeSingle();

    // A database row only records the webhook we last registered; it does not
    // prove Asana is still delivering it. Asana can remove a webhook after
    // repeated delivery failures, which previously left reverse sync silently
    // disabled forever because this early-return trusted the stale row.
    if (existing?.is_active && existing.asana_webhook_gid) {
      const { data: verification } = await supabase.functions.invoke('asana-proxy', {
        body: {
          action: 'get_webhook',
          integration_id: integrationId,
          webhook_gid: existing.asana_webhook_gid,
        },
      });

      if (verification?.success && verification.webhook?.active !== false) return;

      console.warn(
        `[AsanaSync] Webhook ${existing.asana_webhook_gid} is stale; registering a replacement for project ${projectGid}`,
      );
      await supabase
        .from('asana_webhooks')
        .update({ is_active: false, asana_webhook_gid: null })
        .eq('id', existing.id);
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (!supabaseUrl) {
      console.warn('[AsanaSync] VITE_SUPABASE_URL missing; cannot auto-register webhook');
      return;
    }
    const targetUrl = `${supabaseUrl}/functions/v1/asana-webhook?integration_id=${integrationId}&project_gid=${projectGid}`;

    // Upsert placeholder row first so the webhook handshake can persist the secret.
    await supabase.from('asana_webhooks').upsert(
      {
        integration_id: integrationId,
        asana_project_gid: projectGid,
        target_url: targetUrl,
        is_active: true,
      },
      { onConflict: 'integration_id,asana_project_gid' },
    );

    const { data } = await supabase.functions.invoke('asana-proxy', {
      body: {
        action: 'register_webhook',
        integration_id: integrationId,
        project_gid: projectGid,
        target_url: targetUrl,
      },
    });

    if (data?.success && data.webhook?.gid) {
      await supabase
        .from('asana_webhooks')
        .update({ asana_webhook_gid: data.webhook.gid, is_active: true })
        .eq('integration_id', integrationId)
        .eq('asana_project_gid', projectGid);
      console.log(`[AsanaSync] Auto-registered webhook for project ${projectGid}`);
    } else {
      console.warn(`[AsanaSync] Auto-register webhook failed for project ${projectGid}`, data);
    }
  } catch (e) {
    console.warn('[AsanaSync] ensureAsanaWebhookForProject error:', e);
  }
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
    companyId,
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

    // Retry with exponential backoff for transient errors (429 / 5xx)
    let attempt = 0;
    let lastError: string | null = null;
    let lastStatus: number | null = null;
    let lastBody: unknown = null;
    let asanaGid: string | null = null;
    const MAX_ATTEMPTS = 3;

    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      const { data, error: invokeError } = await supabase.functions.invoke('asana-proxy', {
        body: { action: 'create_task', integration_id: ctx.integrationId, task_data: taskData },
      });
      lastStatus = (data as any)?.http_status ?? null;
      lastBody = (data as any)?.response_body ?? null;
      if (data?.success && data.task?.gid) {
        asanaGid = data.task.gid as string;
        await logSyncAttempt({
          task_id: task.id,
          asana_task_gid: asanaGid,
          action: 'create_task',
          success: true,
          payload: taskData,
          company_id: ctx.companyId || null,
          http_status: lastStatus,
          response_body: lastBody,
          attempt_number: attempt,
        });
        break;
      }
      lastError = (data as any)?.error || invokeError?.message || 'Asana proxy returned no task gid';
      console.error(`[AsanaSync] create_task attempt ${attempt} failed status=${lastStatus} err=${lastError}`);
      await logSyncAttempt({
        task_id: task.id,
        action: 'create_task',
        success: false,
        error_message: lastError,
        payload: taskData,
        company_id: ctx.companyId || null,
        http_status: lastStatus,
        response_body: lastBody,
        attempt_number: attempt,
      });
      // Retry only on transient errors
      const transient = lastStatus === 429 || (lastStatus !== null && lastStatus >= 500);
      if (!transient || attempt >= MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
    }

    if (!asanaGid) {
      await supabase
        .from('tasks')
        .update({
          asana_sync_status: 'failed',
          asana_sync_error: lastError,
          asana_sync_attempts: attempt,
        } as any)
        .eq('id', task.id);
      return null;
    }

    // Store the Asana GID back on the naitive task
    await supabase
      .from('tasks')
      .update({
        asana_task_gid: asanaGid,
        asana_sync_status: 'synced',
        asana_sync_error: null,
        asana_synced_at: new Date().toISOString(),
        asana_sync_attempts: attempt,
      } as any)
      .eq('id', task.id);

    // Ensure inbound webhook coverage for every project this task lives in
    // so completions and due-date changes made in Asana flow back to
    // naitive — regardless of which project the task was routed to.
    try {
      const projectGids = new Set<string>();
      if (ctx.projectGid) projectGids.add(ctx.projectGid);
      // Asana's create response may include additional memberships if the
      // task was routed via section rules. Cover those too.
      const createdTask = (lastBody as any)?.data;
      const memberships: Array<{ project?: { gid?: string } }> = createdTask?.memberships || [];
      for (const m of memberships) {
        if (m?.project?.gid) projectGids.add(m.project.gid);
      }
      for (const gid of projectGids) {
        // Fire-and-forget — each helper is best-effort and never throws.
        void ensureAsanaWebhookForProject(ctx.integrationId, gid);
      }
    } catch (e) {
      console.warn('[AsanaSync] webhook coverage step failed:', e);
    }

    return asanaGid;
  } catch (e) {
    console.error('Asana task sync failed:', e);
    const msg = e instanceof Error ? e.message : String(e);
    await logSyncAttempt({
      task_id: task.id,
      action: 'create_task',
      success: false,
      error_message: msg,
      company_id: ctx.companyId || null,
    });
    await supabase
      .from('tasks')
      .update({ asana_sync_status: 'failed', asana_sync_error: msg } as any)
      .eq('id', task.id);
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

    const ok = data?.success ?? false;
    await logSyncAttempt({
      asana_task_gid: asanaTaskGid,
      action: 'update_task',
      success: ok,
      error_message: ok ? null : (data?.error || 'Asana proxy update failed'),
      payload: asanaUpdates,
      company_id: ctx.companyId || null,
    });
    return ok;
  } catch (e) {
    console.error('Asana task update failed:', e);
    await logSyncAttempt({
      asana_task_gid: asanaTaskGid,
      action: 'update_task',
      success: false,
      error_message: e instanceof Error ? e.message : String(e),
      company_id: ctx.companyId || null,
    });
    return false;
  }
}
