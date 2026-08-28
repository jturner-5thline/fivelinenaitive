import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DupCandidateRow {
  id: string;
  company_id: string;
  candidate_task_id: string;
  canonical_task_id: string | null;
  result: 'duplicate' | 'related' | 'distinct' | 'needs_review';
  confidence: number;
  reasons: string[];
  risk_flags: string[];
  user_explanation: string | null;
  suggested_action: 'consolidate' | 'mark_related' | 'keep_separate' | 'manual_review';
  compared_task_ids: string[];
  trigger_source: string;
  status: 'pending' | 'reviewed' | 'dismissed' | 'consolidated';
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_action: string | null;
  created_at: string;
}

export interface CompareTaskRef {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  description: string | null;
  updated_at: string;
  assigned_to: string | null;
}

/** Subscribe to pending duplicate candidates for a given task (the candidate side). */
export function useTaskDuplicateCandidates(taskId: string | null | undefined) {
  const qc = useQueryClient();
  const key = ['task-dup-candidates', taskId];

  const { data: rows = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_duplicate_candidates')
        .select('*')
        .eq('candidate_task_id', taskId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as DupCandidateRow[];
    },
  });

  // Realtime — re-fetch on insert/update for this candidate
  useEffect(() => {
    if (!taskId) return;
    const channel = supabase
      .channel(`tdc-${taskId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'task_duplicate_candidates',
        filter: `candidate_task_id=eq.${taskId}`,
      }, () => qc.invalidateQueries({ queryKey: key }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [taskId, qc]);

  const DONE = new Set(['complete', 'completed', 'done']);

  // Hydrate compared task summaries (titles, etc.) for display
  const comparedIds = Array.from(new Set(rows.flatMap(r => [
    ...(r.compared_task_ids || []),
    r.canonical_task_id,
  ].filter(Boolean) as string[])));

  const { data: comparedMap = {} } = useQuery({
    queryKey: ['task-dup-compared', comparedIds.sort().join(',')],
    enabled: comparedIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, description, updated_at, assigned_to')
        .in('id', comparedIds);
      if (error) throw error;
      const map: Record<string, CompareTaskRef> = {};
      for (const t of (data || []) as CompareTaskRef[]) map[t.id] = t;
      return map;
    },
  });

  // Triggers an on-demand duplicate check (used after save / on focus).
  const runCheck = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('task-duplicate-check', {
        body: { task_id: id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  // Update a candidate's status (dismiss / mark related / keep separate).
  const decide = useMutation({
    mutationFn: async ({ rowId, action }: { rowId: string; action: 'mark_related' | 'keep_separate' | 'dismiss' }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const status = action === 'dismiss' ? 'dismissed' : 'reviewed';
      const { error } = await supabase
        .from('task_duplicate_candidates')
        .update({
          status,
          review_action: action === 'mark_related' ? 'marked_related' : action === 'keep_separate' ? 'kept_separate' : 'dismissed',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id || null,
        })
        .eq('id', rowId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: key });
      const msg = vars.action === 'mark_related' ? 'Marked as related'
        : vars.action === 'keep_separate' ? 'Kept separate'
        : 'Dismissed';
      toast.success(msg);
    },
    onError: () => toast.error('Failed to update'),
  });

  // Consolidate (merge) — calls server-side merge edge function.
  const consolidate = useMutation({
    mutationFn: async ({ rowId, candidateId, canonicalId }: { rowId: string; candidateId: string; canonicalId: string }) => {
      const { data, error } = await supabase.functions.invoke('task-duplicate-consolidate', {
        body: { row_id: rowId, candidate_task_id: candidateId, canonical_task_id: canonicalId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['my-tasks'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Tasks consolidated');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to consolidate'),
  });

  // Exclude candidates whose peer tasks are all completed — completed tasks are never duplicates.
  const visibleRows = rows.filter(r => {
    const peerIds = (r.compared_task_ids || []).filter(id => id !== taskId);
    if (peerIds.length === 0) return true;
    const hydrated = peerIds.map(id => comparedMap[id]).filter(Boolean) as CompareTaskRef[];
    if (hydrated.length === 0) return true;
    return hydrated.some(t => !DONE.has(String(t.status || '').toLowerCase()));
  });

  return { rows: visibleRows, comparedMap, isLoading, runCheck, decide, consolidate };
}