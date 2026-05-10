import { supabase } from '@/integrations/supabase/client';

export interface TaskAssociations {
  deal_id?: string | null;
  contact_id?: string | null;
  crm_company_id?: string | null;
}

/**
 * Auto-derive missing Deal / Contact / Company associations for a task.
 *
 * Rules:
 * - If deal_id is set but crm_company_id is missing → pull deal.crm_company_id.
 * - If deal_id is set but contact_id is missing → pick first contact whose
 *   crm_company_id matches the deal's crm_company_id (best-effort "primary contact").
 * - If contact_id is set but crm_company_id is missing → pull contact.crm_company_id.
 *
 * Never overwrites an explicit value. Returns a new object.
 */
export async function deriveTaskAssociations(input: TaskAssociations): Promise<TaskAssociations> {
  const out: TaskAssociations = { ...input };

  try {
    // Hydrate from deal
    if (out.deal_id && (!out.crm_company_id || !out.contact_id)) {
      const { data: deal } = await supabase
        .from('deals')
        .select('crm_company_id')
        .eq('id', out.deal_id)
        .maybeSingle();
      if (deal?.crm_company_id && !out.crm_company_id) {
        out.crm_company_id = deal.crm_company_id;
      }
      if (deal?.crm_company_id && !out.contact_id) {
        const { data: primaryContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('crm_company_id', deal.crm_company_id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (primaryContact?.id) out.contact_id = primaryContact.id;
      }
    }

    // Hydrate from contact
    if (out.contact_id && !out.crm_company_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('crm_company_id')
        .eq('id', out.contact_id)
        .maybeSingle();
      if (contact?.crm_company_id) out.crm_company_id = contact.crm_company_id;
    }
  } catch (e) {
    console.warn('[taskAssociations] derive failed', e);
  }

  return out;
}

/**
 * Cross-log a task completion to the deal / contact / crm_company timelines.
 * Best-effort: failures are swallowed and logged.
 */
export async function logTaskCompletionAcrossTimelines(params: {
  taskId: string;
  taskTitle: string;
  deal_id?: string | null;
  contact_id?: string | null;
  crm_company_id?: string | null;
  actorUserId?: string | null;
  actorDisplayName?: string | null;
}) {
  const { taskId, taskTitle, deal_id, contact_id, crm_company_id, actorUserId, actorDisplayName } = params;

  // Resolve deal name once if needed by company log
  let dealName: string | null = null;
  if (deal_id) {
    try {
      const { data: deal } = await supabase.from('deals').select('company').eq('id', deal_id).maybeSingle();
      dealName = deal?.company || null;
    } catch { /* ignore */ }
  }

  const baseMetadata = { task_id: taskId, source: 'task_completion' };
  const writes: Promise<unknown>[] = [];

  if (deal_id) {
    writes.push(
      supabase.from('activity_logs').insert({
        deal_id,
        user_id: actorUserId ?? null,
        user_display_name: actorDisplayName ?? null,
        activity_type: 'task_completed',
        description: `✅ Task completed: ${taskTitle}${actorDisplayName ? ` by ${actorDisplayName}` : ''}`,
        metadata: baseMetadata,
      } as any).then(({ error }) => { if (error) console.warn('[taskCrossLog] deal log failed', error); })
    );
  }

  if (contact_id) {
    writes.push(
      supabase.from('contact_activities').insert({
        contact_id,
        deal_id: deal_id ?? null,
        logged_by: actorUserId ?? null,
        activity_type: 'task_completed',
        subject: `✅ Task completed: ${taskTitle}`,
        body: actorDisplayName ? `Completed by ${actorDisplayName}` : null,
        metadata: baseMetadata,
      } as any).then(({ error }) => { if (error) console.warn('[taskCrossLog] contact log failed', error); })
    );
  }

  if (crm_company_id) {
    writes.push(
      supabase.from('crm_company_activities').insert({
        crm_company_id,
        deal_id: deal_id ?? null,
        contact_id: contact_id ?? null,
        logged_by: actorUserId ?? null,
        activity_type: 'task_completed',
        subject: `✅ Task completed: ${taskTitle}${dealName ? ` (re: ${dealName})` : ''}`,
        body: actorDisplayName ? `Completed by ${actorDisplayName}` : null,
        metadata: baseMetadata,
      } as any).then(({ error }) => { if (error) console.warn('[taskCrossLog] company log failed', error); })
    );
  }

  await Promise.allSettled(writes);
}
