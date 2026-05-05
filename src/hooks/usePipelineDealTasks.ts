import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Batched hook returning open tasks + open outstanding items grouped by deal.
 * Used by the Pipeline & Clients memo cards (Daily Briefing / Niki briefing)
 * to render the "Tasks & milestones" band without doing per-deal queries.
 */
export interface DealTaskItem {
  id: string;
  kind: 'task' | 'outstanding';
  title: string;
  dueDate?: string | null;
  assignedToName?: string | null;
  assignedByName?: string | null;
  requestedByName?: string | null;
}

interface RawTask {
  id: string;
  deal_id: string | null;
  title: string;
  due_date: string | null;
  status: string;
  archived_at: string | null;
  assignee_profile?: { display_name: string | null } | null;
  creator_profile?: { display_name: string | null } | null;
}

interface RawOutstanding {
  id: string;
  deal_id: string | null;
  description: string;
  due_date: string | null;
  status: string | null;
  position: number | null;
}

function shortName(full?: string | null): string | null {
  if (!full) return null;
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

function parseRequestedBy(status: string | null): string | null {
  if (!status) return null;
  try {
    const parsed = JSON.parse(status);
    const arr = parsed?.requestedBy;
    if (Array.isArray(arr) && arr.length > 0) return shortName(String(arr[0]));
  } catch { /* noop */ }
  return null;
}

function isOutstandingOpen(status: string | null): boolean {
  if (!status) return true;
  try {
    const p = JSON.parse(status);
    return !(p.approved && p.received);
  } catch {
    return !['approved', 'delivered', 'received', 'completed', 'complete'].includes(status);
  }
}

export function usePipelineDealTasks(dealIds: string[], enabled: boolean = true) {
  const idsKey = useMemo(() => dealIds.slice().sort().join(','), [dealIds]);

  return useQuery({
    queryKey: ['pipeline-deal-tasks', idsKey],
    enabled: enabled && dealIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      // Chunk to keep .in() under URL limits.
      const chunks: string[][] = [];
      for (let i = 0; i < dealIds.length; i += 200) chunks.push(dealIds.slice(i, i + 200));

      const taskChunks = await Promise.all(
        chunks.map((ids) =>
          supabase
            .from('tasks')
            .select(
              'id, deal_id, title, due_date, status, archived_at, assignee_profile:profiles!tasks_assigned_to_fkey(display_name), creator_profile:profiles!tasks_assigned_by_fkey(display_name)'
            )
            .in('deal_id', ids)
            .is('archived_at', null)
            .neq('status', 'complete')
            .order('due_date', { ascending: true, nullsFirst: false })
            .limit(500),
        ),
      );

      const itemChunks = await Promise.all(
        chunks.map((ids) =>
          supabase
            .from('outstanding_items')
            .select('id, deal_id, description, due_date, status, position')
            .in('deal_id', ids)
            .order('position', { ascending: true })
            .limit(500),
        ),
      );

      const tasks = taskChunks.flatMap((r) => (r.data || [])) as unknown as RawTask[];
      const items = itemChunks.flatMap((r) => (r.data || [])) as unknown as RawOutstanding[];

      const byDeal = new Map<string, DealTaskItem[]>();
      for (const t of tasks) {
        if (!t.deal_id) continue;
        const arr = byDeal.get(t.deal_id) || [];
        arr.push({
          id: `t-${t.id}`,
          kind: 'task',
          title: t.title,
          dueDate: t.due_date,
          assignedToName: shortName(t.assignee_profile?.display_name),
          assignedByName: shortName(t.creator_profile?.display_name),
        });
        byDeal.set(t.deal_id, arr);
      }
      for (const it of items) {
        if (!it.deal_id) continue;
        if (!isOutstandingOpen(it.status)) continue;
        const arr = byDeal.get(it.deal_id) || [];
        arr.push({
          id: `o-${it.id}`,
          kind: 'outstanding',
          title: it.description,
          dueDate: it.due_date,
          requestedByName: parseRequestedBy(it.status),
        });
        byDeal.set(it.deal_id, arr);
      }
      return byDeal;
    },
  });
}