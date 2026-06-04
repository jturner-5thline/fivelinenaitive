import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';

export type InsightsCommentSource = 'qir' | 'agenda';

export interface InsightsUserComment {
  id: string;
  source: InsightsCommentSource;
  body: string;
  created_at: string;
  /** report_key (qir) or agenda_id (agenda) */
  scope_key: string;
  /** Tab the comment lives on (e.g. 'JT', 'JM', 'SW', 'Agenda') */
  tab_label: string;
  tab_index: number;
  /** For qir comments only */
  target_type?: string;
  target_id?: string;
  /** For agenda comments */
  thread_id?: string;
  anchor_text?: string | null;
  /** Optional queue status enrichment from report_agenda_queue */
  queue_status?: 'queued' | 'added_to_agenda' | 'dismissed' | 'archived' | null;
}

/** report_key → tab metadata. Keep in sync with ManagementReviewCarousel PAGES. */
const QIR_REPORT_TAB: Record<string, { label: string; index: number }> = {
  'report-1': { label: 'JT Report', index: 4 },
  'report-2': { label: 'JM Report', index: 5 },
  'report-3': { label: 'SW Report', index: 6 },
};

function reportKeyToTab(key: string): { label: string; index: number } {
  return QIR_REPORT_TAB[key] || { label: 'Report', index: 4 };
}

/**
 * Aggregates every comment authored by the current user across the Insights
 * surfaces (QIR reports + Agenda). Used by the shared Insights header Queue
 * dropdown so users can see and jump to all their comments in one place.
 */
export function useInsightsUserComments() {
  const { user } = useAuth();
  const { company } = useCompany();
  const [qirRows, setQirRows] = useState<any[]>([]);
  const [agendaRows, setAgendaRows] = useState<any[]>([]);
  const [threadMap, setThreadMap] = useState<Record<string, { agenda_id: string; anchor_text: string | null }>>({});
  const [queueByComment, setQueueByComment] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const userId = user?.id;
  const companyId = company?.id;

  // Initial fetch
  useEffect(() => {
    if (!userId || !companyId) { setLoading(false); return; }
    let alive = true;
    setLoading(true);
    (async () => {
      const [qirRes, agendaRes, queueRes] = await Promise.all([
        supabase
          .from('qir_comments' as any)
          .select('id, body, created_at, report_key, target_type, target_id, company_id, author_user_id')
          .eq('company_id', companyId)
          .eq('author_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('agenda_comments')
          .select('id, body, created_at, thread_id, deleted_at, author_id, company_id')
          .eq('company_id', companyId)
          .eq('author_id', userId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('report_agenda_queue' as any)
          .select('comment_id, comment_source, queue_status')
          .eq('company_id', companyId)
          .eq('created_by', userId),
      ]);
      if (!alive) return;
      const qir = (qirRes.data as any[]) || [];
      const ag = (agendaRes.data as any[]) || [];
      setQirRows(qir);
      setAgendaRows(ag);

      const threadIds = Array.from(new Set(ag.map((r) => r.thread_id).filter(Boolean)));
      if (threadIds.length) {
        const { data: threads } = await supabase
          .from('agenda_comment_threads')
          .select('id, agenda_id, anchor_text')
          .in('id', threadIds);
        if (alive && threads) {
          const map: Record<string, { agenda_id: string; anchor_text: string | null }> = {};
          for (const t of threads as any[]) map[t.id] = { agenda_id: t.agenda_id, anchor_text: t.anchor_text };
          setThreadMap(map);
        }
      }

      const qmap: Record<string, string> = {};
      for (const q of ((queueRes.data as any[]) || [])) {
        if (q.comment_id) qmap[`${q.comment_source}:${q.comment_id}`] = q.queue_status;
      }
      setQueueByComment(qmap);

      setLoading(false);
    })();
    return () => { alive = false; };
  }, [userId, companyId]);

  // Realtime — refresh on author's own inserts/updates/deletes
  useEffect(() => {
    if (!userId || !companyId) return;
    const ch = supabase
      .channel(`insights-user-comments-${companyId}-${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'qir_comments',
        filter: `company_id=eq.${companyId}`,
      }, (payload) => {
        const row = (payload.new || payload.old) as any;
        if (!row || row.author_user_id !== userId) return;
        if (payload.eventType === 'DELETE') {
          setQirRows((prev) => prev.filter((r) => r.id !== row.id));
        } else if (payload.eventType === 'INSERT') {
          setQirRows((prev) => (prev.find((r) => r.id === row.id) ? prev : [row, ...prev]));
        } else {
          setQirRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'agenda_comments',
        filter: `company_id=eq.${companyId}`,
      }, (payload) => {
        const row = (payload.new || payload.old) as any;
        if (!row || row.author_id !== userId) return;
        if (payload.eventType === 'DELETE' || row.deleted_at) {
          setAgendaRows((prev) => prev.filter((r) => r.id !== row.id));
        } else if (payload.eventType === 'INSERT') {
          setAgendaRows((prev) => (prev.find((r) => r.id === row.id) ? prev : [row, ...prev]));
        } else {
          setAgendaRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, companyId]);

  const items: InsightsUserComment[] = useMemo(() => {
    const list: InsightsUserComment[] = [];
    for (const r of qirRows) {
      const tab = reportKeyToTab(r.report_key);
      list.push({
        id: r.id,
        source: 'qir',
        body: r.body || '',
        created_at: r.created_at,
        scope_key: r.report_key,
        tab_label: tab.label,
        tab_index: tab.index,
        target_type: r.target_type,
        target_id: r.target_id,
        queue_status: (queueByComment[`qir:${r.id}`] as any) ?? null,
      });
    }
    for (const r of agendaRows) {
      const meta = threadMap[r.thread_id];
      list.push({
        id: r.id,
        source: 'agenda',
        body: r.body || '',
        created_at: r.created_at,
        scope_key: meta?.agenda_id || r.thread_id,
        tab_label: 'Agenda',
        tab_index: 0,
        thread_id: r.thread_id,
        anchor_text: meta?.anchor_text ?? null,
        queue_status: (queueByComment[`agenda:${r.id}`] as any) ?? null,
      });
    }
    list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return list;
  }, [qirRows, agendaRows, threadMap, queueByComment]);

  const refresh = useCallback(() => {
    // Manual nudge — toggle a state to re-run effect could be added; for now
    // realtime keeps the list fresh. Expose for the dropdown's pull-to-refresh.
  }, []);

  /**
   * Delete a comment from the user's Insights queue. Removes both the
   * underlying comment (qir_comments / agenda_comments) and any
   * report_agenda_queue staging row that references it.
   */
  const deleteComment = useCallback(async (item: InsightsUserComment) => {
    // Drop any linked queue row first (best-effort).
    if (companyId) {
      await supabase
        .from('report_agenda_queue' as any)
        .delete()
        .eq('company_id', companyId)
        .eq('comment_source', item.source)
        .eq('comment_id', item.id);
    }
    if (item.source === 'qir') {
      const { error } = await supabase.from('qir_comments' as any).delete().eq('id', item.id);
      if (error) throw error;
      setQirRows((prev) => prev.filter((r) => r.id !== item.id));
    } else {
      const { error } = await supabase
        .from('agenda_comments')
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq('id', item.id);
      if (error) throw error;
      setAgendaRows((prev) => prev.filter((r) => r.id !== item.id));
    }
    setQueueByComment((prev) => {
      const k = `${item.source}:${item.id}`;
      if (!(k in prev)) return prev;
      const { [k]: _drop, ...rest } = prev;
      return rest;
    });
  }, [companyId]);

  return { items, loading, refresh, deleteComment, count: items.length };
}