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
  assigned_to: string | null;
  assigned_by: string | null;
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
            .select('id, deal_id, title, due_date, status, archived_at, assigned_to, assigned_by')
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

      // Resolve assignee / creator display names in a single batched query.
      const userIds = Array.from(
        new Set(
          tasks.flatMap((t) => [t.assigned_to, t.assigned_by]).filter(Boolean) as string[],
        ),
      );
      const profileMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds);
        for (const p of profiles || []) {
          if (p.id) profileMap.set(p.id, p.display_name || '');
        }
      }

      const byDeal = new Map<string, DealTaskItem[]>();
      for (const t of tasks) {
        if (!t.deal_id) continue;
        const arr = byDeal.get(t.deal_id) || [];
        arr.push({
          id: `t-${t.id}`,
          kind: 'task',
          title: t.title,
          dueDate: t.due_date,
          assignedToName: shortName(t.assigned_to ? profileMap.get(t.assigned_to) : null),
          assignedByName: shortName(t.assigned_by ? profileMap.get(t.assigned_by) : null),
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