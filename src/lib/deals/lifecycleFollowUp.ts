import { supabase } from '@/integrations/supabase/client';
import { FIFTH_LINE_COMPANY_ID } from '@/hooks/useNaitivePipelineAccess';

/**
 * 5th Line lifecycle follow-up automation.
 *
 * When a deal transitions to an "inactive" state we:
 *   1. Dismiss deal-scoped notifications (flex_info_notifications +
 *      current user's in-app notification_instances tied to this deal).
 *   2. Clear due dates on all open tasks for this deal.
 *   3. Create a new "Follow Up on [DEAL NAME]" task assigned to the deal
 *      manager (or deal_owner fallback) with a due date offset:
 *        - Archived / In Development pipeline: 60 days
 *        - On Hold status: 30 days
 *
 * Scoped strictly to the 5th Line company account.
 */

const IN_DEVELOPMENT_PIPELINE_NAME_MATCH = '%in development%';

type Trigger = 'archived' | 'in-development' | 'on-hold';

interface Params {
  dealId: string;
  dealName: string;
  managerUserId: string | null;
  currentUserId: string;
  companyId: string | null;
  previousStatus: string | null | undefined;
  nextStatus: string | null | undefined;
  previousPipelineId: string | null | undefined;
  nextPipelineId: string | null | undefined;
}

async function isInDevelopmentPipeline(pipelineId: string | null | undefined): Promise<boolean> {
  if (!pipelineId) return false;
  const { data } = await supabase
    .from('deal_pipelines')
    .select('name')
    .eq('id', pipelineId)
    .maybeSingle();
  const name = ((data as any)?.name || '').toLowerCase();
  return name.includes('in development');
}

function detectTrigger(args: {
  previousStatus: string | null | undefined;
  nextStatus: string | null | undefined;
  wasInDev: boolean;
  isInDev: boolean;
}): Trigger | null {
  const { previousStatus, nextStatus, wasInDev, isInDev } = args;
  if (nextStatus === 'archived' && previousStatus !== 'archived') return 'archived';
  if (isInDev && !wasInDev) return 'in-development';
  if (nextStatus === 'on-hold' && previousStatus !== 'on-hold') return 'on-hold';
  return null;
}

export async function applyLifecycleFollowUp(params: Params): Promise<void> {
  // Strict gate: 5th Line only.
  if (params.companyId !== FIFTH_LINE_COMPANY_ID) return;

  // Only re-resolve pipeline names when something actually changed to avoid
  // an extra round-trip on unrelated deal edits.
  const pipelineChanged =
    params.nextPipelineId !== undefined &&
    params.nextPipelineId !== params.previousPipelineId;

  const [wasInDev, isInDev] = await Promise.all([
    isInDevelopmentPipeline(params.previousPipelineId),
    pipelineChanged
      ? isInDevelopmentPipeline(params.nextPipelineId)
      : isInDevelopmentPipeline(params.previousPipelineId),
  ]);

  const trigger = detectTrigger({
    previousStatus: params.previousStatus,
    nextStatus: params.nextStatus,
    wasInDev,
    isInDev,
  });
  if (!trigger) return;

  const offsetDays = trigger === 'on-hold' ? 30 : 60;
  const dueDate = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString();
  const assignee = params.managerUserId || params.currentUserId;

  // 1) Dismiss deal-scoped notifications.
  const dealId = params.dealId;
  await Promise.all([
    supabase
      .from('flex_info_notifications')
      .update({ status: 'dismissed' } as any)
      .eq('deal_id', dealId)
      .in('status', ['pending', 'read']),
    supabase
      .from('notification_instances')
      .update({ read_at: new Date().toISOString() } as any)
      .eq('recipient_user_id', params.currentUserId)
      .is('read_at', null)
      .contains('context', { deal_id: dealId } as any),
  ]).catch((e) => console.error('[lifecycleFollowUp] notification clear failed', e));

  // 2) Clear due dates on all open tasks for this deal.
  try {
    await supabase
      .from('tasks')
      .update({ due_date: null } as any)
      .eq('deal_id', dealId)
      .neq('status', 'completed');
  } catch (e) {
    console.error('[lifecycleFollowUp] clear task due dates failed', e);
  }

  // 3) Create the follow-up task (idempotent per trigger + due date).
  try {
    const title = `Follow Up on ${params.dealName || 'Deal'}`;
    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('deal_id', dealId)
      .eq('title', title)
      .neq('status', 'completed')
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      await supabase
        .from('tasks')
        .update({ due_date: dueDate, assigned_to: assignee } as any)
        .eq('id', (existing as any).id);
    } else {
      await supabase.from('tasks').insert({
        title,
        description: `Auto-created follow-up after deal moved to ${trigger === 'on-hold' ? 'On Hold' : trigger === 'archived' ? 'Archived' : 'In Development'}.`,
        assigned_to: assignee,
        assigned_by: params.currentUserId,
        due_date: dueDate,
        status: 'not_started',
        deal_id: dealId,
        company_id: params.companyId,
      } as any);
    }
  } catch (e) {
    console.error('[lifecycleFollowUp] create follow-up task failed', e);
  }
}
