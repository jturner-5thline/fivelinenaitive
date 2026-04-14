import { supabase } from '@/integrations/supabase/client';

interface AsanaSyncContext {
  integrationId: string;
  workspaceGid: string;
  projectGid: string | null;
  sectionGid: string | null;
}

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

export async function updateTaskInAsana(
  ctx: AsanaSyncContext,
  asanaTaskGid: string,
  updates: { due_date?: string | null; assignee_email?: string | null }
): Promise<boolean> {
  try {
    const asanaUpdates: Record<string, unknown> = {};

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
