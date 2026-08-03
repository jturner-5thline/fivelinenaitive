import { supabase } from '@/integrations/supabase/client';

/**
 * Task provenance helpers.
 *
 * Every follow-up task that originates from a *wrap-up* (a calendar event /
 * Claap recording) or from a *decision* (an approval-queue proposal) must
 * carry a pointer back to its origin:
 *
 *   - `source_calendar_event_id` → the calendar/Claap event it came from
 *   - `source_queue_item_id`     → the `ai_action_queue` row it came from
 *
 * Without this, the unified Today surface cannot tell that "Follow up on
 * ByRider kickoff" (an active task) and the ByRider wrap-up card are the same
 * piece of work — which is exactly the duplication the merge is meant to kill.
 *
 * Rule of thumb: never insert a follow-up task directly. Go through
 * `createFollowUpTaskDeduped` so write-time dedupe and provenance are applied
 * consistently across every creation surface.
 */

export const OPEN_TASK_STATUSES = ['not_started', 'pending', 'in_progress'] as const;

export interface TaskProvenance {
  /** Calendar / Claap event id this follow-up wraps up. */
  sourceCalendarEventId?: string | null;
  /** ai_action_queue row id this task was created from. */
  sourceQueueItemId?: string | null;
}

export interface ExistingFollowUpTask {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  deal_id: string | null;
  source_calendar_event_id: string | null;
  source_queue_item_id: string | null;
}

const OPEN_SELECT =
  'id, title, status, due_date, assigned_to, deal_id, source_calendar_event_id, source_queue_item_id';

/**
 * Find an *open* task already tracking this event. Matches on either
 * provenance column (`source_calendar_event_id` is what we write; legacy rows
 * from the Nylas importer used `nylas_event_id`).
 */
export async function findOpenTaskForEvent(
  eventId: string,
  opts: { dealId?: string | null } = {},
): Promise<ExistingFollowUpTask | null> {
  if (!eventId) return null;
  let q = supabase
    .from('tasks')
    .select(OPEN_SELECT)
    .is('archived_at', null)
    .in('status', OPEN_TASK_STATUSES as unknown as string[])
    .or(`source_calendar_event_id.eq.${eventId},nylas_event_id.eq.${eventId}`)
    .limit(1);
  if (opts.dealId) q = q.eq('deal_id', opts.dealId);
  const { data, error } = await q.maybeSingle();
  if (error) return null;
  return (data as ExistingFollowUpTask) ?? null;
}

/** Find an open task already created from a given approval-queue item. */
export async function findOpenTaskForQueueItem(
  queueItemId: string,
): Promise<ExistingFollowUpTask | null> {
  if (!queueItemId) return null;
  const { data, error } = await supabase
    .from('tasks')
    .select(OPEN_SELECT)
    .is('archived_at', null)
    .in('status', OPEN_TASK_STATUSES as unknown as string[])
    .eq('source_queue_item_id', queueItemId)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as ExistingFollowUpTask) ?? null;
}

/**
 * Last-resort dedupe for creation surfaces that have no event/queue id:
 * an open task on the same deal with the same normalized title.
 */
export async function findOpenDuplicateByTitle(
  title: string,
  dealId: string | null,
): Promise<ExistingFollowUpTask | null> {
  const normalized = title.trim();
  if (!normalized) return null;
  let q = supabase
    .from('tasks')
    .select(OPEN_SELECT)
    .is('archived_at', null)
    .in('status', OPEN_TASK_STATUSES as unknown as string[])
    .ilike('title', normalized)
    .limit(1);
  q = dealId ? q.eq('deal_id', dealId) : q.is('deal_id', null);
  const { data, error } = await q.maybeSingle();
  if (error) return null;
  return (data as ExistingFollowUpTask) ?? null;
}

export interface CreateFollowUpTaskInput extends TaskProvenance {
  title: string;
  dealId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  dueDate?: string | null;
  assignedTo: string;
  assignedBy: string;
  description?: string | null;
  priority?: string;
  /** Skip the title-only fallback check (use when duplicates are legitimate). */
  allowDuplicateTitle?: boolean;
}

export interface CreateFollowUpTaskResult {
  id: string;
  /** True when an existing open task was returned instead of inserting. */
  deduped: boolean;
}

/**
 * Provenance-aware, write-time-deduped task creation.
 *
 * Order of checks:
 *   1. queue item id  → exact origin match
 *   2. calendar event → exact origin match (scoped to the deal when known)
 *   3. title + deal   → fallback for user-typed follow-ups
 */
export async function createFollowUpTaskDeduped(
  input: CreateFollowUpTaskInput,
): Promise<CreateFollowUpTaskResult> {
  if (input.sourceQueueItemId) {
    const hit = await findOpenTaskForQueueItem(input.sourceQueueItemId);
    if (hit) return { id: hit.id, deduped: true };
  }
  if (input.sourceCalendarEventId) {
    const hit = await findOpenTaskForEvent(input.sourceCalendarEventId, {
      dealId: input.dealId ?? null,
    });
    if (hit) return { id: hit.id, deduped: true };
  }
  if (!input.allowDuplicateTitle) {
    const hit = await findOpenDuplicateByTitle(input.title, input.dealId ?? null);
    if (hit) return { id: hit.id, deduped: true };
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: input.title.trim(),
      description: input.description ?? null,
      deal_id: input.dealId ?? null,
      company_id: input.companyId ?? null,
      contact_id: input.contactId ?? null,
      due_date: input.dueDate ?? null,
      assigned_to: input.assignedTo,
      assigned_by: input.assignedBy,
      status: 'not_started',
      priority: input.priority ?? 'medium',
      source_calendar_event_id: input.sourceCalendarEventId ?? null,
      source_queue_item_id: input.sourceQueueItemId ?? null,
    } as never)
    .select('id')
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id, deduped: false };
}