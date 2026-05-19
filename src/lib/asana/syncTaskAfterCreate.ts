import { supabase } from '@/integrations/supabase/client';
import { getAsanaSyncContext, syncTaskToAsana } from '@/hooks/useAsanaTaskSync';

/**
 * Single entry point every task-creation code path should call after inserting
 * a row into `public.tasks`. It:
 *   1. Resolves the current user's company_id (if not provided)
 *   2. Resolves the assignee's email (if not provided but assigned_to is known)
 *   3. Looks up the Asana sync context
 *   4. Calls syncTaskToAsana (which itself retries 429/5xx and persists
 *      asana_sync_status / asana_task_gid back to the row)
 *
 * Fire-and-forget friendly: never throws. Returns { ok, gid, error } so the
 * caller can show inline feedback if desired.
 */
export interface SyncTaskAfterCreateInput {
  taskId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  assignedTo?: string | null;       // user_id of the assignee
  assigneeEmail?: string | null;    // optional pre-resolved
  companyId?: string | null;        // optional pre-resolved
}

export interface SyncTaskAfterCreateResult {
  ok: boolean;
  gid: string | null;
  error: string | null;
  skipped?: boolean;
  reason?: string;
}

export async function syncTaskAfterCreate(
  input: SyncTaskAfterCreateInput,
): Promise<SyncTaskAfterCreateResult> {
  try {
    // 1. Resolve company_id if not provided
    let companyId = input.companyId || null;
    if (!companyId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: memberData } = await supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        companyId = memberData?.company_id || null;
      }
    }

    // 2. Resolve assignee email if not provided
    let assigneeEmail = input.assigneeEmail || null;
    if (!assigneeEmail && input.assignedTo) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('user_id', input.assignedTo)
        .maybeSingle();
      assigneeEmail = profile?.email || null;
    }

    // 3. Resolve Asana sync context
    const ctx = await getAsanaSyncContext(companyId);
    if (!ctx) {
      await supabase
        .from('tasks')
        .update({ asana_sync_status: 'disabled' } as any)
        .eq('id', input.taskId);
      return { ok: true, gid: null, error: null, skipped: true, reason: 'no_sync_context' };
    }

    // 4. Sync (retry + status persistence handled inside)
    const gid = await syncTaskToAsana(ctx, {
      id: input.taskId,
      title: input.title,
      description: input.description ?? null,
      due_date: input.dueDate ?? null,
      assignee_email: assigneeEmail,
    });

    if (!gid) {
      // Read the persisted error back from the row to return to caller
      const { data: row } = await supabase
        .from('tasks')
        .select('asana_sync_error')
        .eq('id', input.taskId)
        .maybeSingle();
      return { ok: false, gid: null, error: (row as any)?.asana_sync_error || 'Asana sync failed' };
    }

    return { ok: true, gid, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[syncTaskAfterCreate] unexpected error:', msg);
    return { ok: false, gid: null, error: msg };
  }
}

/**
 * Retry an Asana sync for an existing task row. Looks up its current title /
 * due_date / assignee from the DB to ensure we always sync the latest snapshot.
 */
export async function retryAsanaSyncForTask(taskId: string): Promise<SyncTaskAfterCreateResult> {
  const { data: task, error } = await supabase
    .from('tasks')
    .select('id, title, description, due_date, assigned_to, company_id, asana_task_gid')
    .eq('id', taskId)
    .maybeSingle();
  if (error || !task) {
    return { ok: false, gid: null, error: error?.message || 'Task not found' };
  }
  // If we already have a gid, an update path is more appropriate, but for now
  // we just attempt a fresh create — the helper will overwrite asana_task_gid.
  return syncTaskAfterCreate({
    taskId: task.id,
    title: (task as any).title,
    description: (task as any).description,
    dueDate: (task as any).due_date,
    assignedTo: (task as any).assigned_to,
    companyId: (task as any).company_id,
  });
}