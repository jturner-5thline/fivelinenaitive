import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
  | 'claap_action_items';

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
      .channel(`ai-action-queue-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_action_queue', filter: `user_id=eq.${user.id}` },
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
    queryFn: async (): Promise<QueuedAiAction[]> => {
      const { data, error } = await supabase
        .from('ai_action_queue')
        .select('*')
        .in('status', ['pending'])
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = (data || []) as QueuedAiAction[];
      // Lazy-mark expired rows
      const expiredIds = rows.filter(isStale).map(r => r.id);
      if (expiredIds.length > 0) {
        await supabase
          .from('ai_action_queue')
          .update({ status: 'expired' })
          .in('id', expiredIds);
        return rows.filter(r => !expiredIds.includes(r.id));
      }
      return rows;
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
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from('ai_action_queue')
        .select('id, status, expires_at')
        .eq('status', 'pending')
        .limit(500);
      if (error) throw error;
      const now = Date.now();
      return (data || []).filter(
        (r: { status: string; expires_at: string }) =>
          r.status === 'pending' && new Date(r.expires_at).getTime() >= now,
      ).length;
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
      return data as QueuedAiAction;
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
      toast.success(`Dismissed ${ids.length} item${ids.length !== 1 ? 's' : ''}`);
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
async function executeQueuedAction(item: QueuedAiAction, userId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    switch (item.action_type) {
      case 'create_task': {
        const p = item.payload || {};
        const { data: created, error } = await supabase.from('tasks').insert({
          title: p.title || item.title,
          description: p.description ?? item.description ?? null,
          due_date: p.due_date ?? null,
          priority: p.priority ?? 'medium',
          deal_id: item.deal_id,
          assigned_to: p.assigned_to ?? userId,
          assigned_by: userId,
        } as any).select('id').single();
        if (error) return { ok: false, error: error.message };
        if (created?.id) {
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
        // Save-to-data-room requires interactive file context, so the queued
        // action just records a TODO note on the deal timeline pointing at the
        // source email; the user can then open the email and finalize the upload.
        const p = item.payload || {};
        const { error } = await supabase.from('activity_logs').insert({
          deal_id: item.deal_id,
          activity_type: 'data_room_suggestion',
          description: `AI Queue: save attachments to data room — ${p.subject || item.title}`,
          user_id: userId,
        });
        if (error) return { ok: false, error: error.message };
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
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unknown error' };
  }
}

export function useApproveAiAction() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useCallback(
    async (item: QueuedAiAction) => {
      if (!user) return { ok: false };
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