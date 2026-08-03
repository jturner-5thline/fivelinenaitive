import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { OPEN_TASK_STATUSES } from '@/lib/tasks/followUpProvenance';

/**
 * The "today slice" of active tasks that belongs on the unified Today surface.
 *
 * Deliberately NOT the full task list — the queue is the today-scoped decision
 * surface, My Tasks stays the browsable system of record. A task qualifies when
 * it is open AND any of:
 *
 *   - overdue (due before today)
 *   - due today
 *   - blocking a queued decision (`source_queue_item_id` is set)
 *
 * Every row carries its provenance so the Today surface can collapse a task and
 * its originating wrap-up card into a single entry.
 */

export interface TodayTask {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  deal_id: string | null;
  assigned_to: string | null;
  source_calendar_event_id: string | null;
  source_queue_item_id: string | null;
  source_calendar_event_title: string | null;
  deal?: { company: string | null } | null;
  bucket: 'overdue' | 'today' | 'blocking';
}

function todayISO() {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function useTodayTasks(enabled = true) {
  const { user } = useAuth();
  const today = todayISO();

  const query = useQuery({
    queryKey: ['today-tasks', user?.id, today],
    enabled: enabled && !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<TodayTask[]> => {
      if (!user?.id) return [];
      const select =
        'id, title, status, priority, due_date, deal_id, assigned_to, source_calendar_event_id, source_queue_item_id, source_calendar_event_title, deal:deals(company)';

      const base = () =>
        supabase
          .from('tasks')
          .select(select)
          .eq('assigned_to', user.id)
          .is('archived_at', null)
          .in('status', OPEN_TASK_STATUSES as unknown as string[]);

      const [dueRes, blockingRes] = await Promise.all([
        base().lte('due_date', today).order('due_date', { ascending: true }).limit(200),
        base().not('source_queue_item_id', 'is', null).limit(100),
      ]);

      if (dueRes.error) throw dueRes.error;

      const byId = new Map<string, TodayTask>();
      for (const row of (dueRes.data || []) as any[]) {
        byId.set(row.id, {
          ...row,
          bucket: row.due_date && row.due_date < today ? 'overdue' : 'today',
        } as TodayTask);
      }
      for (const row of ((blockingRes.data || []) as any[])) {
        if (byId.has(row.id)) continue;
        byId.set(row.id, { ...row, bucket: 'blocking' } as TodayTask);
      }

      const order = { overdue: 0, today: 1, blocking: 2 } as const;
      return [...byId.values()].sort((a, b) => {
        if (order[a.bucket] !== order[b.bucket]) return order[a.bucket] - order[b.bucket];
        return (a.due_date || '9999').localeCompare(b.due_date || '9999');
      });
    },
  });

  const counts = useMemo(() => {
    const rows = query.data || [];
    return {
      total: rows.length,
      overdue: rows.filter(r => r.bucket === 'overdue').length,
      today: rows.filter(r => r.bucket === 'today').length,
      blocking: rows.filter(r => r.bucket === 'blocking').length,
    };
  }, [query.data]);

  /** Event ids already represented by an open task — used to dedupe wrap-ups. */
  const coveredEventIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of query.data || []) {
      if (t.source_calendar_event_id) s.add(t.source_calendar_event_id);
    }
    return s;
  }, [query.data]);

  return {
    tasks: query.data || [],
    isLoading: query.isLoading,
    refetch: query.refetch,
    counts,
    coveredEventIds,
  };
}