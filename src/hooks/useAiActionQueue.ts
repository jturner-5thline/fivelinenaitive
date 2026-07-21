import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { invalidateAllTaskCaches } from '@/lib/taskCache';

/**
 * Uploads an email attachment described by a save_to_data_room proposal
 * into the deal's Data Room under the internal-only "Terms" folder.
 *
 * All heavy lifting (email_cache read, Nylas download, storage upload,
 * vdr_documents insert) happens inside the `save-terms-attachment` edge
 * function with the service role, because the email may have been synced
 * by a different teammate whose RLS-protected email_cache row the current
 * reviewer cannot read from the browser.
 */
async function saveEmailAttachmentToTerms(params: {
  dealId: string;
  attachmentName: string;
  sourceEmailId: string;
  userId: string; // caller (for parity with old signature; edge fn re-derives)
}): Promise<{ ok: boolean; error?: string; documentId?: string }> {
  const { data, error } = await supabase.functions.invoke('save-terms-attachment', {
    body: {
      deal_id: params.dealId,
      attachment_name: params.attachmentName,
      source_email_id: params.sourceEmailId,
    },
  });
  if (error) {
    const detail = (data as any)?.error || error.message || 'invoke failed';
    return { ok: false, error: detail };
  }
  if (!data?.ok) return { ok: false, error: (data as any)?.error || 'unknown error' };
  return { ok: true, documentId: (data as any)?.document_id };
}

/**
 * After a Terms Issued bundle's add_status_note is approved, apply the two
 * remaining side-effects the reviewer expects from the bundle even though
 * they live on separate queue rows: advance the referenced funding source
 * (deal_lenders row encoded in the bundle_key) to the "Terms Issued" stage
 * with the note as its lender-notes, and upload every sibling
 * save_to_data_room attachment to the deal's internal Terms folder.
 */
async function applyTermsIssuedBundleSideEffects(params: {
  note: string;
  dealId: string;
  bundleKey: string; // "terms_issued:{deal_id}:{funding_source_id}"
  userId: string;
}): Promise<{
  savedCount: number;
  errors: string[];
  lenderName: string | null;
  lenderStageAdvanced: boolean;
  lenderStageAlreadyAtOrPast: boolean;
  lenderUpdateOk: boolean;
  savedAttachments: string[];
  failedAttachments: string[];
}> {
  const errors: string[] = [];
  const parts = params.bundleKey.split(':');
  const fsId = parts[2];
  let lenderName: string | null = null;
  let lenderStageAdvanced = false;
  let lenderStageAlreadyAtOrPast = false;
  let lenderUpdateOk = false;
  const savedAttachments: string[] = [];
  const failedAttachments: string[] = [];
  // 1) Advance the funding source unless it's already at/past Terms Issued.
  if (fsId) {
    try {
      const { data: dl } = await (supabase as any)
        .from('deal_lenders')
        .select('stage, name, master_lender_id')
        .eq('id', fsId)
        .maybeSingle();
      const currentStage = String(dl?.stage || '').toLowerCase();
      lenderStageAlreadyAtOrPast = ['terms-issued', 'terms_issued', 'in-diligence', 'in_diligence', 'closed', 'funded'].includes(currentStage);
      lenderName = (dl as any)?.name ?? null;
      if (!lenderName && (dl as any)?.master_lender_id) {
        const { data: master } = await (supabase as any)
          .from('master_lenders')
          .select('name')
          .eq('id', (dl as any).master_lender_id)
          .maybeSingle();
        lenderName = (master as any)?.name ?? null;
      }
      const upd: Record<string, unknown> = {
        notes: params.note,
        last_status_change_at: new Date().toISOString(),
      };
      if (!lenderStageAlreadyAtOrPast) {
        upd.stage = 'terms-issued';
        upd.tracking_status = 'active';
        lenderStageAdvanced = true;
      }
      const { error: dlErr } = await (supabase as any)
        .from('deal_lenders')
        .update(upd)
        .eq('id', fsId);
      if (dlErr) {
        errors.push(`funding source update failed (${dlErr.message})`);
        lenderStageAdvanced = false;
      } else {
        lenderUpdateOk = true;
      }
    } catch (e: any) {
      errors.push(`funding source update threw (${e?.message || 'unknown'})`);
    }
  }
  // 2) Save every sibling save_to_data_room attachment sharing this bundle_key.
  //    Include pending / failed / dismissed rows: they were part of the same
  //    bundle the reviewer just approved, so their attachments belong in the
  //    Terms folder even if the row itself was previously auto-dismissed.
  let savedCount = 0;
  try {
    const { data: siblings } = await (supabase as any)
      .from('ai_action_queue')
      .select('id, status, new_values')
      .eq('action_type', 'save_to_data_room')
      .eq('deal_id', params.dealId)
      .filter('new_values->>bundle_key', 'eq', params.bundleKey);
    for (const row of siblings ?? []) {
      if (row.status === 'approved') continue;
      const nv = (row.new_values || {}) as any;
      const attachmentName: string | undefined = nv.attachment_name;
      const sourceEmailId: string | undefined = nv.source_email_id;
      if (!attachmentName || !sourceEmailId) continue;
      const res = await saveEmailAttachmentToTerms({
        dealId: params.dealId,
        attachmentName,
        sourceEmailId,
        userId: params.userId,
      });
      const now = new Date().toISOString();
      if (res.ok) {
        savedCount += 1;
        savedAttachments.push(attachmentName);
        await supabase
          .from('ai_action_queue')
          .update({
            status: 'approved',
            approved_at: now,
            executed_at: now,
            execution_error: null,
          })
          .eq('id', row.id);
      } else {
        errors.push(`save "${attachmentName}": ${res.error}`);
        failedAttachments.push(attachmentName);
        await supabase
          .from('ai_action_queue')
          .update({ status: 'failed', execution_error: res.error })
          .eq('id', row.id);
      }
    }
  } catch (e: any) {
    errors.push(`sibling scan failed (${e?.message || 'unknown'})`);
  }
  return {
    savedCount,
    errors,
    lenderName,
    lenderStageAdvanced,
    lenderStageAlreadyAtOrPast,
    lenderUpdateOk,
    savedAttachments,
    failedAttachments,
  };
}

/**
 * AI Approval Queue — deferred AI suggestions awaiting user approval.
 *
 * Items live in `ai_action_queue` and expire after 48h. The user can
 * "Add to Queue" any AI-suggested action (instead of confirming it inline)
 * and later approve / edit / dismiss them in bulk from the dashboard.
 */
export type AiActionType =
  | 'create_task'
  | 'update_lender_status'
  | 'save_to_data_room'
  | 'log_note'
  | 'deal_update'
  | 'claap_recording_review'
  | 'claap_action_items'
  | 'update_deal_stage'
  | 'update_deal_status'
  | 'add_status_note'
  | 'update_funding_source'
  | 'create_milestone'
  | 'update_milestone'
  | 'create_followup_task'
  | 'update_contact'
  | 'update_company'
  | 'draft_email'
  | 'escalate'
  | 'reassign_deal'
  | 'create_new_deal';

export type AiActionStatus =
  | 'pending'
  | 'approved'
  | 'dismissed'
  | 'expired'
  | 'failed';

export interface QueuedAiAction {
  id: string;
  user_id: string;
  deal_id: string | null;
  deal_name: string | null;
  action_type: AiActionType;
  title: string;
  description: string | null;
  payload: Record<string, any>;
  source: Record<string, any>;
  status: AiActionStatus;
  approved_at: string | null;
  dismissed_at: string | null;
  executed_at: string | null;
  execution_error: string | null;
  reminder_sent_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  assigned_to?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent' | null;
  risk_level?: 'low' | 'medium' | 'high' | null;
  target_object_type?: string | null;
  target_object_id?: string | null;
  old_values?: Record<string, any> | null;
  new_values?: Record<string, any> | null;
  evidence?: Array<{ kind: string; label: string; ref_id?: string; snippet?: string; url?: string }>;
  rationale?: string | null;
  edited_before_approval?: boolean | null;
  rejection_reason?: string | null;
  reassigned_from?: string | null;
  more_context_requested_at?: string | null;
  more_context_notes?: string | null;
}

export interface EnqueueArgs {
  action_type: AiActionType;
  title: string;
  description?: string | null;
  deal_id?: string | null;
  deal_name?: string | null;
  payload?: Record<string, any>;
  source?: Record<string, any>;
}

const QUEUE_KEY = ['ai-action-queue'] as const;
const QUEUE_COUNT_KEY = ['ai-action-queue-count'] as const;

async function fetchVisibleQueueRows(): Promise<QueuedAiAction[]> {
  const { data, error } = await (supabase as any).rpc('get_visible_ai_action_queue');
  if (error) throw error;
  return (data || []) as QueuedAiAction[];
}

/** Invalidate both the panel and lightweight count queries together so
 * mutations stay consistent with realtime fan-out. */
function invalidateQueueAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: QUEUE_KEY });
  qc.invalidateQueries({ queryKey: QUEUE_COUNT_KEY });
}

/** Trailing-edge debounce window for realtime-driven refetches. Bursts of
 * row changes (bulk approve, multi-insert) are coalesced into a single
 * invalidation so we don't thrash the queue + count queries. */
// Fire realtime queue invalidations immediately so edits, approvals, and
// rejections propagate to every viewer with no perceptible delay. This
// minimizes the window in which two teammates could act on the same item.
const REALTIME_DEBOUNCE_MS = 0;

function isStale(item: QueuedAiAction): boolean {
  return item.status === 'pending' && new Date(item.expires_at).getTime() < Date.now();
}

/**
 * Subscribe to realtime row changes on `ai_action_queue` for this user and
 * fan-out a single debounced invalidation that refreshes BOTH the panel
 * query and the lightweight count query. Centralized so any consumer that
 * mounts a queue/count hook gets live updates without each hook opening
 * its own channel.
 */
function useAiActionQueueRealtime() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const flush = () => {
      timerRef.current = null;
      invalidateQueueAll(qc);
    };

    const channel = supabase
      .channel(`ai-action-queue-shared`)
      .on(
        'postgres_changes',
        // No user_id filter: the queue is shared across teammates, so
        // approve/reject by any user should live-update every viewer's panel.
        { event: '*', schema: 'public', table: 'ai_action_queue' },
        () => {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(flush, REALTIME_DEBOUNCE_MS);
        },
      )
      .subscribe();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [user?.id, qc]);
}

/**
 * List the user's pending queued actions (auto-marks expired entries client-side).
 */
export function useAiActionQueue() {
  const { user } = useAuth();
  useAiActionQueueRealtime();

  return useQuery({
    queryKey: [...QUEUE_KEY, user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    // Safety net: realtime postgres_changes can drop events under RLS or
    // socket reconnects. Poll every 10s so cross-user approve/reject updates
    // always converge quickly even if a realtime event is missed.
    refetchInterval: 1_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<QueuedAiAction[]> => {
      const visible = (await fetchVisibleQueueRows()).filter(r => !isStale(r));
      // De-duplicate: the same recommendation can be enqueued multiple
      // times (e.g. by repeated AI runs across 5th Line teammates on the
      // shared queue). Collapse to one card per logical action in-memory,
      // keeping the most recent row. This is display-only: do not dismiss,
      // approve, delete, or otherwise mutate hidden duplicates.
      const seen = new Map<string, QueuedAiAction>();
      // rows are already ordered created_at DESC — first occurrence wins.
      for (const r of visible) {
        const key = [
          r.action_type,
          r.deal_id ?? '',
          (r.title || '').trim().toLowerCase(),
          // For non-task actions, payload identity matters (e.g.
          // different lender ids). Hash a stable subset.
          r.action_type === 'create_task'
            ? ''
            : JSON.stringify(r.payload ?? {}),
        ].join('|');
        if (!seen.has(key)) {
          seen.set(key, r);
        }
      }
      return Array.from(seen.values());
    },
  });
}

/**
 * Just the count of pending non-expired items, for the nav badge.
 *
 * This is a SEPARATE lightweight query (selects only id/status/expires_at)
 * so mounting a badge anywhere in the app doesn't pull the full payload
 * for every queued action. Realtime invalidations from
 * `useAiActionQueueRealtime` keep it live alongside the panel query.
 */
export function useAiActionQueueCount(): number {
  const { user } = useAuth();
  useAiActionQueueRealtime();

  const { data = 0 } = useQuery({
    queryKey: [...QUEUE_COUNT_KEY, user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: 1_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<number> => {
      const now = Date.now();
      const live = (await fetchVisibleQueueRows()).filter(
        (r: any) =>
          r.status === 'pending' && new Date(r.expires_at).getTime() >= now,
      );
      // Mirror dedupe logic from useAiActionQueue so the badge count
      // matches what the user sees in the panel.
      const seen = new Set<string>();
      for (const r of live as any[]) {
        const key = [
          r.action_type,
          r.deal_id ?? '',
          (r.title || '').trim().toLowerCase(),
          r.action_type === 'create_task' ? '' : JSON.stringify(r.payload ?? {}),
        ].join('|');
        seen.add(key);
      }
      return seen.size;
    },
  });
  return data;
}

export function useEnqueueAiAction() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useCallback(
    async (args: EnqueueArgs) => {
      if (!user) {
        toast.error('Sign in to queue actions');
        return null;
      }
      const { data, error } = await supabase
        .from('ai_action_queue')
        .insert({
          user_id: user.id,
          action_type: args.action_type,
          title: args.title,
          description: args.description ?? null,
          deal_id: args.deal_id ?? null,
          deal_name: args.deal_name ?? null,
          payload: args.payload ?? {},
          source: args.source ?? {},
        })
        .select()
        .single();
      if (error) {
        console.error('[ai-queue] enqueue error', error);
        toast.error('Could not add to queue');
        return null;
      }
      toast.success('Added to Approval Queue', {
        description: `${args.title} — review later from the queue.`,
      });
      invalidateQueueAll(qc);
      return data as unknown as QueuedAiAction;
    },
    [user, qc],
  );
}

export function useDismissAiAction() {
  const qc = useQueryClient();
  return useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from('ai_action_queue')
        .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        toast.error('Could not dismiss item');
        return;
      }
      invalidateQueueAll(qc);
      toast.success('Item dismissed', {
        action: {
          label: 'Undo',
          onClick: async () => {
            const { error: undoError } = await supabase
              .from('ai_action_queue')
              .update({ status: 'pending', dismissed_at: null })
              .eq('id', id);
            if (undoError) {
              toast.error('Could not undo');
              return;
            }
            invalidateQueueAll(qc);
            toast.success('Dismissal undone');
          },
        },
      });
    },
    [qc],
  );
}

/** Dismiss many queued actions at once (used for per-deal group dismiss). */
export function useDismissManyAiActions() {
  const qc = useQueryClient();
  return useCallback(
    async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from('ai_action_queue')
        .update({ status: 'dismissed', dismissed_at: new Date().toISOString() })
        .in('id', ids);
      if (error) {
        toast.error('Could not dismiss items');
        return;
      }
      invalidateQueueAll(qc);
      toast.success(`Dismissed ${ids.length} item${ids.length !== 1 ? 's' : ''}`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            const { error: undoError } = await supabase
              .from('ai_action_queue')
              .update({ status: 'pending', dismissed_at: null })
              .in('id', ids);
            if (undoError) {
              toast.error('Could not undo');
              return;
            }
            invalidateQueueAll(qc);
            toast.success(`Restored ${ids.length} item${ids.length !== 1 ? 's' : ''}`);
          },
        },
      });
    },
    [qc],
  );
}

export function useUpdateAiAction() {
  const qc = useQueryClient();
  return useCallback(
    async (id: string, patch: Partial<Pick<QueuedAiAction, 'title' | 'description' | 'payload'>>) => {
      const { error } = await supabase
        .from('ai_action_queue')
        .update(patch)
        .eq('id', id);
      if (error) {
        toast.error('Could not update item');
        return;
      }
      invalidateQueueAll(qc);
    },
    [qc],
  );
}

/**
 * Execute a queued action against the appropriate backend table and log the
 * result to the deal activity timeline.
 */
async function executeQueuedAction(
  item: QueuedAiAction,
  userId: string,
): Promise<{ ok: boolean; error?: string; createdTaskId?: string }> {
  try {
    let createdTaskId: string | undefined;
    switch (item.action_type) {
      case 'create_task': {
        const p = item.payload || {};
        const { data: membership, error: membershipError } = await supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();
        if (membershipError) {
          return { ok: false, error: `[create_task] membership lookup failed: ${membershipError.message}` };
        }
        // tasks.priority is constrained to NULL or 'urgent' — coerce anything
        // else (legacy 'medium'/'low'/etc) to null so the insert doesn't fail
        // the check constraint.
        const safePriority = p.priority === 'urgent' ? 'urgent' : null;
        const { data: created, error } = await supabase.from('tasks').insert({
          title: p.title || item.title,
          description: p.description ?? item.description ?? null,
          due_date: p.due_date ?? null,
          priority: safePriority,
          deal_id: item.deal_id,
          assigned_to: p.assigned_to ?? userId,
          assigned_by: userId,
          company_id: membership?.company_id ?? null,
        } as any).select('id').single();
        if (error) return { ok: false, error: error.message };
        if (created?.id) {
          createdTaskId = created.id;
          // Unified deal follow-up backlink (idempotent).
          if (item.deal_id) {
            try {
              const { writeDealFollowUpSource } = await import('@/lib/deals/dealFollowUp');
              await writeDealFollowUpSource({
                dealId: item.deal_id,
                taskId: created.id,
                source: {
                  module: 'other',
                  recordId: `ai-queue:${item.id}`,
                  sourceTimestamp: new Date().toISOString(),
                  sourceText: p.title || item.title,
                },
                title: p.title || item.title,
                userId,
              });
            } catch (e) {
              console.warn('[useAiActionQueue] backlink failed:', e);
            }
          }
          const { syncTaskAfterCreate } = await import('@/lib/asana/syncTaskAfterCreate');
          syncTaskAfterCreate({
            taskId: created.id,
            title: p.title || item.title,
            description: p.description ?? item.description ?? null,
            dueDate: p.due_date ?? null,
            assignedTo: p.assigned_to ?? userId,
          }).catch((e) => console.warn('[useAiActionQueue] asana sync error:', e));
        }
        break;
      }
      case 'log_note': {
        const p = item.payload || {};
        const { error } = await supabase.from('activity_logs').insert({
          deal_id: item.deal_id,
          activity_type: p.activity_type || 'note',
          description: p.description || item.description || item.title,
          user_id: userId,
        });
        if (error) return { ok: false, error: error.message };
        break;
      }
      case 'update_lender_status': {
        const p = item.payload || {};
        if (!p.deal_lender_id || !p.new_status) {
          return { ok: false, error: 'Missing lender id or status' };
        }
        // Lender "status" is stored on deal_lenders.substage (canonical)
        // and tracking_status (legacy mirror). Update both.
        const { error } = await supabase
          .from('deal_lenders')
          .update({ substage: p.new_status, tracking_status: p.tracking_status ?? undefined } as any)
          .eq('id', p.deal_lender_id);
        if (error) return { ok: false, error: error.message };
        break;
      }
      case 'save_to_data_room': {
        // Approving a save_to_data_room action pulls the referenced email
        // attachment from Gmail (via the gmail-messages edge function) and
        // saves it into the deal's Data Room under the internal-only
        // "Terms" folder. Fields live in `new_values` (canonical) or under
        // `payload.on_approve_execution_payload.new_values` for legacy rows.
        const nv =
          (item.new_values as any) ||
          (item.payload as any)?.on_approve_execution_payload?.new_values ||
          {};
        const attachmentName: string | undefined = nv.attachment_name;
        const sourceEmailId: string | undefined = nv.source_email_id;
        if (!item.deal_id) {
          return { ok: false, error: 'save_to_data_room: missing deal_id' };
        }
        if (!attachmentName || !sourceEmailId) {
          return { ok: false, error: 'save_to_data_room: missing attachment_name or source_email_id' };
        }
        const res = await saveEmailAttachmentToTerms({
          dealId: item.deal_id,
          attachmentName,
          sourceEmailId,
          userId,
        });
        if (!res.ok) return { ok: false, error: `save_to_data_room: ${res.error}` };
        break;
      }
      case 'deal_update': {
        const p = item.payload || {};
        if (!item.deal_id || !p.fields || typeof p.fields !== 'object') {
          return { ok: false, error: 'Missing deal id or fields' };
        }
        const { error } = await supabase.from('deals').update(p.fields).eq('id', item.deal_id);
        if (error) return { ok: false, error: error.message };
        break;
      }
      default:
        return { ok: false, error: `Unknown action type: ${item.action_type}` };
    }

    // Log a generic activity entry for traceability.
    if (item.deal_id) {
      await supabase.from('activity_logs').insert({
        deal_id: item.deal_id,
        activity_type: 'ai_action_approved',
        description: `Approved AI Queue action: ${item.title}`,
        user_id: userId,
      });
    }
    return { ok: true, createdTaskId };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unknown error' };
  }
}

export function useApproveAiAction() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useCallback(
    async (item: QueuedAiAction, opts?: { editedValues?: Record<string, any> }) => {
      if (!user) return { ok: false };
      // New execution-checkpoint action types are routed through the
      // approval-queue-execute edge function so the write is audited and
      // server-side. Legacy types still use the inline client executor.
      const newTypes: AiActionType[] = [
        'update_deal_stage','update_deal_status','add_status_note',
        'update_funding_source','create_milestone','update_milestone',
        'create_followup_task','update_contact','update_company',
        'draft_email','escalate','reassign_deal',
      ];
      if (newTypes.includes(item.action_type) || opts?.editedValues) {
        const { data, error } = await supabase.functions.invoke('approval-queue-execute', {
          body: {
            action_id: item.id,
            decision: 'approve',
            edited_values: opts?.editedValues,
          },
        });
        invalidateQueueAll(qc);
        if (error || !data?.ok) {
          toast.error('Action failed', { description: data?.error || error?.message });
          return { ok: false, error: data?.error || error?.message };
        }
        // Terms Issued bundle side-effects: when the reviewer approves the
        // bundle's add_status_note, also advance the funding source AND
        // upload every sibling save_to_data_room attachment to Internal ▸
        // Terms. These live on separate queue rows but semantically are one
        // action from the reviewer's perspective.
        let termsBundleToastShown = false;
        if (item.action_type === 'add_status_note' && item.deal_id) {
          const nv =
            (item.new_values as any) ||
            (item.payload as any)?.on_approve_execution_payload?.new_values ||
            {};
          const bundleKey: string | undefined = nv.bundle_key;
          const note: string | undefined = opts?.editedValues?.note ?? nv.note;
          if (bundleKey && bundleKey.startsWith('terms_issued:') && note) {
            try {
              const side = await applyTermsIssuedBundleSideEffects({
                note,
                dealId: item.deal_id,
                bundleKey,
                userId: user.id,
              });
              invalidateQueueAll(qc);
              // Explicit confirmation toast — spell out what actually
              // happened to the funding source AND to the term-sheet PDF
              // so the reviewer doesn't have to open the deal to verify.
              const lender = side.lenderName || 'Funding source';
              const lenderLine = side.lenderUpdateOk
                ? side.lenderStageAdvanced
                  ? `${lender} → Terms Issued (note saved)`
                  : side.lenderStageAlreadyAtOrPast
                    ? `${lender} note saved (stage already at/past Terms Issued)`
                    : `${lender} note saved`
                : `${lender} update failed`;
              const savedLine =
                side.savedAttachments.length > 0
                  ? `Uploaded to Internal ▸ Terms: ${side.savedAttachments.join(', ')}`
                  : side.failedAttachments.length > 0
                    ? `Failed to upload: ${side.failedAttachments.join(', ')}`
                    : 'No term sheet PDF found to upload';
              const anyFailure =
                !side.lenderUpdateOk || side.failedAttachments.length > 0;
              const toastFn = anyFailure ? toast.warning : toast.success;
              toastFn('Term Sheet Items approved', {
                description: `${lenderLine}\n${savedLine}`,
              });
              termsBundleToastShown = true;
              // Nudge any open Data Room views for this deal to refetch
              // immediately so the newly-uploaded term sheet PDF appears
              // without requiring a manual reload. useVdrDocuments listens
              // for this event.
              if (side.savedAttachments.length > 0 && typeof window !== 'undefined') {
                try {
                  window.dispatchEvent(
                    new CustomEvent('vdr:refresh', { detail: { dealId: item.deal_id } })
                  );
                } catch {}
              }
              // Persistent audit log entry — captures exactly what happened
              // to the funding source and where each term-sheet PDF landed
              // in the Data Room so reviewers (and compliance) can trace the
              // approval after the toast is dismissed.
              try {
                const lenderStageOutcome = side.lenderUpdateOk
                  ? side.lenderStageAdvanced
                    ? 'advanced to Terms Issued'
                    : side.lenderStageAlreadyAtOrPast
                      ? 'note saved (stage already at/past Terms Issued)'
                      : 'note saved'
                  : 'update failed';
                const attachmentsSummary =
                  side.savedAttachments.length > 0
                    ? `Uploaded to Internal ▸ Terms: ${side.savedAttachments.join(', ')}`
                    : side.failedAttachments.length > 0
                      ? `Upload failed: ${side.failedAttachments.join(', ')}`
                      : 'No term sheet PDF found to upload';
                const auditDescription = `Terms Issued bundle approved — ${lender} ${lenderStageOutcome}. ${attachmentsSummary}.`;
                await supabase.from('activity_logs').insert({
                  deal_id: item.deal_id,
                  activity_type: 'ai_terms_issued_approved',
                  description: auditDescription,
                  user_id: user.id,
                  metadata: {
                    action_id: item.id,
                    bundle_key: bundleKey,
                    lender_name: side.lenderName,
                    funding_source_id: bundleKey.split(':')[2] || null,
                    funding_source_update_ok: side.lenderUpdateOk,
                    funding_source_stage_advanced: side.lenderStageAdvanced,
                    funding_source_stage_already_at_or_past:
                      side.lenderStageAlreadyAtOrPast,
                    funding_source_new_stage: side.lenderStageAdvanced
                      ? 'terms-issued'
                      : null,
                    funding_source_new_tracking_status: side.lenderStageAdvanced
                      ? 'active'
                      : null,
                    note_saved: note,
                    attachments_uploaded: side.savedAttachments,
                    attachments_failed: side.failedAttachments,
                    data_room_folder_path: '/Terms/',
                    data_room_section: 'Internal',
                    errors: side.errors,
                  },
                } as any);
              } catch (e) {
                console.warn('[terms-issued audit log] insert failed:', e);
              }
              for (const err of side.errors) {
                console.warn('[terms-issued side-effect]', err);
              }
            } catch (e) {
              console.warn('[terms-issued side-effect] threw:', e);
            }
          }
        }
        const msg = (data as any)?.result_message as string | undefined;
        if (!termsBundleToastShown) {
          if (data.decision === 'email_staged') {
            toast.success(msg || 'Draft staged for send', { description: item.title });
          } else {
            toast.success(msg || 'Approved & applied', { description: item.title });
          }
        }
        // Schedule-a-call side-effect: when the Deal Admin Agent flagged an
        // inbound lender email requesting to connect, the queue item is a
        // create_followup_task tagged with a `schedule_call:` bundle_key.
        // Approving it records the follow-up task AND opens the naitive
        // calendar pop-up prefilled with the deal + lender so the deal
        // owner can pick a time and book the meeting themselves. The agent
        // never schedules automatically — this is a UI hand-off only.
        try {
          if (item.action_type === 'create_followup_task' && item.deal_id) {
            const nv =
              (item.new_values as any) ||
              (item.payload as any)?.on_approve_execution_payload?.new_values ||
              (item.payload as any) ||
              {};
            const bundleKey: string | undefined = nv?.bundle_key;
            if (typeof bundleKey === 'string' && bundleKey.startsWith('schedule_call:')) {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('naitive:open-schedule-call', {
                    detail: {
                      dealId: item.deal_id,
                      dealName: item.deal_name ?? null,
                      lenderName: nv?.lender_name ?? null,
                      contactEmails: Array.isArray(nv?.lender_contact_emails)
                        ? nv.lender_contact_emails
                        : [],
                      title:
                        nv?.title ||
                        item.title ||
                        `Schedule call: ${nv?.lender_name ?? 'lender'}`,
                      description: nv?.description ?? item.description ?? null,
                      sourceRecordId: `ai-queue:${item.id}`,
                    },
                  }),
                );
              }
            }
          }
        } catch (e) {
          console.warn('[schedule-call side-effect] dispatch failed:', e);
        }
        invalidateAllTaskCaches(qc);
        return { ok: true };
      }
      const result = await executeQueuedAction(item, user.id);
      const now = new Date().toISOString();
      await supabase
        .from('ai_action_queue')
        .update({
          status: result.ok ? 'approved' : 'failed',
          approved_at: result.ok ? now : null,
          executed_at: result.ok ? now : null,
          execution_error: result.ok ? null : result.error || 'Execution failed',
        })
        .eq('id', item.id);
      invalidateQueueAll(qc);
      if (result.ok) invalidateAllTaskCaches(qc);
      if (result.ok) {
        const createdTaskId = result.createdTaskId;
        toast.success('Action approved', {
          description: item.title,
          action: {
            label: 'Undo',
            onClick: async () => {
              const { error: undoError } = await supabase
                .from('ai_action_queue')
                .update({
                  status: 'pending',
                  approved_at: null,
                  executed_at: null,
                  execution_error: null,
                })
                .eq('id', item.id);
              if (undoError) {
                toast.error('Could not undo');
                return;
              }
              if (createdTaskId) {
                await supabase.from('tasks').delete().eq('id', createdTaskId);
                invalidateAllTaskCaches(qc);
              }
              invalidateQueueAll(qc);
              toast.success('Approval undone');
            },
          },
        });
      }
      return result;
    },
    [user, qc],
  );
}

export function useApproveAllAiActions() {
  const approve = useApproveAiAction();
  const qc = useQueryClient();
  return useCallback(
    async (items: QueuedAiAction[]) => {
      let okCount = 0;
      let failCount = 0;
      for (const item of items) {
        const r = await approve(item);
        if (r?.ok) okCount += 1; else failCount += 1;
      }
      invalidateQueueAll(qc);
      if (okCount) toast.success(`Approved ${okCount} action${okCount !== 1 ? 's' : ''}`);
      if (failCount) toast.error(`${failCount} failed — check the queue for details`);
    },
    [approve, qc],
  );
}

/**
 * Reject (dismiss with a reason) a queued action via the audited edge function.
 */
export function useRejectAiAction() {
  const qc = useQueryClient();
  return useCallback(async (id: string, reason?: string) => {
    const { data, error } = await supabase.functions.invoke('approval-queue-execute', {
      body: { action_id: id, decision: 'reject', rejection_reason: reason },
    });
    invalidateQueueAll(qc);
    if (error || !data?.ok) {
      toast.error('Could not reject', { description: data?.error || error?.message });
      return { ok: false };
    }
    toast.success('Rejected');
    return { ok: true };
  }, [qc]);
}

/** Reassign a queued action to another user (must be in same company). */
export function useReassignAiAction() {
  const qc = useQueryClient();
  return useCallback(async (id: string, userId: string) => {
    const { data, error } = await supabase.functions.invoke('approval-queue-execute', {
      body: { action_id: id, decision: 'reassign', reassign_to_user_id: userId },
    });
    invalidateQueueAll(qc);
    if (error || !data?.ok) {
      toast.error('Could not reassign', { description: data?.error || error?.message });
      return { ok: false };
    }
    toast.success('Reassigned');
    return { ok: true };
  }, [qc]);
}

/** Mark a queued action as needing more context (notifies the agent). */
export function useRequestMoreContext() {
  const qc = useQueryClient();
  return useCallback(async (id: string, notes: string) => {
    const { data, error } = await supabase.functions.invoke('approval-queue-execute', {
      body: { action_id: id, decision: 'more_context', more_context_notes: notes },
    });
    invalidateQueueAll(qc);
    if (error || !data?.ok) {
      toast.error('Could not request context', { description: data?.error || error?.message });
      return { ok: false };
    }
    toast.success('More context requested');
    return { ok: true };
  }, [qc]);
}

/** List the current user's staged email drafts awaiting manual send. */
export interface StagedEmailDraft {
  id: string;
  source_action_id: string | null;
  user_id: string;
  deal_id: string | null;
  thread_id: string | null;
  to_recipients: any[];
  cc_recipients: any[];
  bcc_recipients: any[];
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  status: 'staged' | 'sent' | 'cancelled';
  staged_at: string;
  sent_at: string | null;
  created_at: string;
}

export function useStagedEmailDrafts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['staged-email-drafts', user?.id ?? 'anon'],
    enabled: !!user,
    staleTime: 15_000,
    queryFn: async (): Promise<StagedEmailDraft[]> => {
      const { data, error } = await supabase
        .from('staged_email_drafts')
        .select('*')
        .eq('status', 'staged')
        .order('staged_at', { ascending: false });
      if (error) throw error;
      return (data || []) as StagedEmailDraft[];
    },
  });
}

export function useSendStagedDraft() {
  const qc = useQueryClient();
  return useCallback(async (draftId: string) => {
    const { data, error } = await supabase.functions.invoke('approval-queue-send-staged', {
      body: { draft_id: draftId, action: 'send' },
    });
    qc.invalidateQueries({ queryKey: ['staged-email-drafts'] });
    if (error || !data?.ok) {
      toast.error('Could not send', { description: data?.error || error?.message });
      return { ok: false };
    }
    toast.success('Email sent');
    return { ok: true };
  }, [qc]);
}

export function useCancelStagedDraft() {
  const qc = useQueryClient();
  return useCallback(async (draftId: string) => {
    const { data, error } = await supabase.functions.invoke('approval-queue-send-staged', {
      body: { draft_id: draftId, action: 'cancel' },
    });
    qc.invalidateQueries({ queryKey: ['staged-email-drafts'] });
    if (error || !data?.ok) {
      toast.error('Could not cancel', { description: data?.error || error?.message });
      return { ok: false };
    }
    toast.success('Draft cancelled');
    return { ok: true };
  }, [qc]);
}