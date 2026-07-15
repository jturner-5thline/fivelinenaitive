import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { invalidateAllTaskCaches } from '@/lib/taskCache';

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
const REALTIME_DEBOUNCE_MS = 250;

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

        // 1. Look up the deal's company_id (required for vdr_documents row).
        const { data: deal, error: dealErr } = await supabase
          .from('deals')
          .select('company_id')
          .eq('id', item.deal_id)
          .maybeSingle();
        if (dealErr || !deal?.company_id) {
          return { ok: false, error: `save_to_data_room: deal lookup failed (${dealErr?.message || 'no company_id'})` };
        }

        // 2. Locate the attachment metadata cached alongside the email so we
        //    can resolve its provider attachment id.
        const { data: cached, error: cacheErr } = await supabase
          .from('email_cache')
          .select('attachments')
          .eq('gmail_message_id', sourceEmailId)
          .limit(1)
          .maybeSingle();
        if (cacheErr) {
          return { ok: false, error: `save_to_data_room: email lookup failed (${cacheErr.message})` };
        }
        const atts: any[] = Array.isArray((cached as any)?.attachments) ? (cached as any).attachments : [];
        const match = atts.find((a) => a?.filename === attachmentName)
          || atts.find((a) => (a?.filename || '').toLowerCase() === attachmentName.toLowerCase())
          || (atts.length === 1 ? atts[0] : null);
        if (!match?.id) {
          return { ok: false, error: `save_to_data_room: attachment "${attachmentName}" not found on email` };
        }

        // 3. Fetch the attachment binary from the provider (base64).
        const { data: attData, error: attErr } = await supabase.functions.invoke('gmail-messages', {
          body: { action: 'get_attachment', message_id: sourceEmailId, attachment_id: match.id },
        });
        if (attErr || !attData?.data) {
          return { ok: false, error: `save_to_data_room: attachment download failed (${attErr?.message || 'no data'})` };
        }
        const base64: string = attData.data;
        const contentType: string = attData.content_type || match.content_type || 'application/octet-stream';
        // Decode base64 → Uint8Array → Blob for storage upload.
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: contentType.split(';')[0].trim() });

        // 4. Upload into the Terms folder in the vdr-files bucket.
        const folderPath = '/Terms/';
        const storagePath = `${item.deal_id}${folderPath}${attachmentName}`;
        const { error: upErr } = await supabase.storage
          .from('vdr-files')
          .upload(storagePath, blob, { upsert: true, contentType: contentType.split(';')[0].trim() });
        if (upErr) {
          return { ok: false, error: `save_to_data_room: storage upload failed (${upErr.message})` };
        }

        // 5. Insert the vdr_documents row. Internal-only Terms folder → never
        //    shared to the external Data Room.
        const { data: inserted, error: insErr } = await (supabase as any)
          .from('vdr_documents')
          .insert({
            deal_id: item.deal_id,
            company_id: deal.company_id,
            filename: attachmentName,
            file_path: storagePath,
            file_size: bytes.length,
            file_type: contentType.split(';')[0].trim() || attachmentName.split('.').pop() || null,
            folder_path: folderPath,
            is_folder: false,
            source: 'dataroom',
            uploaded_by: userId,
            ingestion_status: 'pending',
            shared_to_dataroom: false,
          })
          .select('id')
          .single();
        if (insErr) {
          return { ok: false, error: `save_to_data_room: vdr_documents insert failed (${insErr.message})` };
        }

        // 6. Fire-and-forget AI classification so the file gets processed
        //    like any other Data Room upload.
        if (inserted?.id) {
          supabase.functions
            .invoke('classify-file', { body: { document_id: inserted.id } })
            .catch((e) => console.warn('[save_to_data_room] classify-file invoke failed:', e));
        }
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
        const msg = (data as any)?.result_message as string | undefined;
        if (data.decision === 'email_staged') {
          toast.success(msg || 'Draft staged for send', { description: item.title });
        } else {
          toast.success(msg || 'Approved & applied', { description: item.title });
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