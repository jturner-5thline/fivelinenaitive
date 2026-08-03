import { supabase } from '@/integrations/supabase/client';
import {
  findOpenTaskForEvent,
  findOpenTaskForQueueItem,
} from '@/lib/tasks/followUpProvenance';

/**
 * Unified data model for deal-linked follow-ups (tasks & calendar events).
 *
 * Canonical stores (do NOT introduce new tables):
 *   - kind='task'  → public.tasks                  (with deal_id set)
 *   - kind='event' → public.deal_calendar_items    (with deal_id set)
 *   - backlink     → public.calendar_item_sources  (always, when a source is provided)
 *
 * The deal calendar (CalendarPanel) reads `deal_calendar_items` directly and
 * overlays `tasks` keyed by deal_id+due_date via usePipelineDealTasks. So a
 * row written by this helper appears on the deal calendar regardless of kind.
 *
 * Every creation surface in the app should funnel through this helper so:
 *   1. Tenant scoping (deal_id) is consistent.
 *   2. Source provenance is preserved in calendar_item_sources.
 *   3. Re-syncs and retries don't create duplicate follow-ups
 *      (idempotency by source_module + source_record_id + title + date).
 */

export type DealFollowUpSourceModule =
  | 'meeting_notes'
  | 'claap_summary'
  | 'rundown_item'
  | 'agenda'
  | 'report'
  | 'comment'
  | 'deal_memo'
  | 'other';

export interface DealFollowUpSource {
  module: DealFollowUpSourceModule;
  /** Stable id of the originating record (meeting id, email id, mention id…). */
  recordId: string;
  /** ISO timestamp anchoring relative-date parsing / preview. */
  sourceTimestamp: string;
  sourceText?: string;
  deepLinkUrl?: string | null;
}

/**
 * Write the calendar_item_sources backlink for a previously-created task or
 * calendar item. Idempotent: skips when a backlink already exists for the
 * same (deal_id, source_module, source_record_id, source_text) tuple.
 */
export async function writeDealFollowUpSource(args: {
  dealId: string;
  taskId?: string | null;
  dealCalendarItemId?: string | null;
  source: DealFollowUpSource;
  title: string;
  userId: string;
}): Promise<{ id?: string; skipped: boolean; error?: string }> {
  const sourceText = args.source.sourceText ?? args.title;
  try {
    // Idempotency guard — NOT EXISTS on (deal_id, module, record_id, source_text).
    const { data: existing } = await supabase
      .from('calendar_item_sources')
      .select('id')
      .eq('deal_id', args.dealId)
      .eq('source_module', args.source.module)
      .eq('source_record_id', args.source.recordId)
      .eq('source_text', sourceText)
      .limit(1)
      .maybeSingle();
    if (existing?.id) return { id: existing.id, skipped: true };

    const { data, error } = await supabase
      .from('calendar_item_sources')
      .insert({
        deal_id: args.dealId,
        task_id: args.taskId ?? null,
        deal_calendar_item_id: args.dealCalendarItemId ?? null,
        source_module: args.source.module,
        source_record_id: args.source.recordId,
        source_timestamp: args.source.sourceTimestamp,
        source_text: sourceText,
        source_deep_link: args.source.deepLinkUrl ?? null,
        created_by: args.userId,
      } as never)
      .select('id')
      .single();
    if (error) {
      // Non-fatal — the task/event itself is already saved.
      // eslint-disable-next-line no-console
      console.warn('[dealFollowUp] backlink insert failed:', error);
      return { skipped: true, error: error.message };
    }
    return { id: (data as { id: string }).id, skipped: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn('[dealFollowUp] backlink writer threw:', msg);
    return { skipped: true, error: msg };
  }
}

export interface CreateDealFollowUpInput {
  kind: 'task' | 'event';
  /** May be null for plain (unlinked) task creation. Required for events. */
  dealId: string | null;
  title: string;
  /** YYYY-MM-DD. Required for events; optional for tasks. */
  date: string | null;
  /** HH:MM (events only). */
  time?: string | null;
  notes?: string | null;
  userId: string;
  companyId?: string | null;
  /** Defaults to userId for tasks. */
  assignedTo?: string;
  /** Pass null/undefined for user-typed entries with no upstream record. */
  source?: DealFollowUpSource | null;
  /**
   * Provenance for the unified Today surface. When either id is supplied the
   * writer dedupes against an existing OPEN task from the same origin instead
   * of creating a second copy of the same piece of work.
   */
  sourceCalendarEventId?: string | null;
  sourceQueueItemId?: string | null;
}

export interface CreateDealFollowUpResult {
  id: string;
  kind: 'task' | 'event';
  backlinkId?: string;
  /** True when an existing open task was reused rather than inserted. */
  deduped?: boolean;
}

export async function createDealFollowUp(
  input: CreateDealFollowUpInput,
): Promise<CreateDealFollowUpResult> {
  let createdId: string;

  if (input.kind === 'task') {
    // ── Write-time dedupe by provenance ──────────────────────────────
    if (input.sourceQueueItemId) {
      const hit = await findOpenTaskForQueueItem(input.sourceQueueItemId);
      if (hit) return { id: hit.id, kind: 'task', deduped: true };
    }
    if (input.sourceCalendarEventId) {
      const hit = await findOpenTaskForEvent(input.sourceCalendarEventId, {
        dealId: input.dealId ?? null,
      });
      if (hit) return { id: hit.id, kind: 'task', deduped: true };
    }
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: input.title,
        description: input.notes ?? null,
        assigned_to: input.assignedTo ?? input.userId,
        assigned_by: input.userId,
        due_date: input.date,
        status: 'not_started',
        deal_id: input.dealId ?? null,
        company_id: input.companyId ?? null,
        source_calendar_event_id: input.sourceCalendarEventId ?? null,
        source_queue_item_id: input.sourceQueueItemId ?? null,
      } as never)
      .select('id')
      .single();
    if (error) throw error;
    createdId = (data as { id: string }).id;
  } else {
    if (!input.date) throw new Error('Event follow-up requires a date.');
    if (!input.dealId) throw new Error('Event follow-up requires a linked deal.');
    const time = input.time
      ? input.time.length === 5
        ? `${input.time}:00`
        : input.time
      : null;
    const { data, error } = await supabase
      .from('deal_calendar_items')
      .insert({
        deal_id: input.dealId,
        title: input.title,
        date: input.date,
        time,
        notes: input.notes ?? null,
        type: time ? 'meeting' : 'deadline',
        created_by: input.userId,
      } as never)
      .select('id')
      .single();
    if (error) throw error;
    createdId = (data as { id: string }).id;
  }

  let backlinkId: string | undefined;
  if (input.source && input.dealId) {
    const r = await writeDealFollowUpSource({
      dealId: input.dealId,
      taskId: input.kind === 'task' ? createdId : null,
      dealCalendarItemId: input.kind === 'event' ? createdId : null,
      source: input.source,
      title: input.title,
      userId: input.userId,
    });
    backlinkId = r.id;
  }

  return { id: createdId, kind: input.kind, backlinkId };
}