import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { useInsightsTimeframeOptional, reportingPeriodHelpers } from '@/contexts/InsightsTimeframeContext';

export type ReportQueueSourceType =
  | 'selected_text' | 'narrative' | 'kpi' | 'chart'
  | 'goal' | 'initiative' | 'risk' | 'section';

export type ReportQueueStatus =
  | 'queued' | 'added_to_agenda' | 'dismissed' | 'archived';

export type ReportQueueInsertionMode =
  | 'body_reference' | 'free_text' | 'footnote_only';

export interface ReportQueueItem {
  id: string;
  company_id: string;
  period_type: 'month' | 'quarter';
  period_key: string;
  report_tab: string | null;
  source_type: ReportQueueSourceType;
  source_id: string | null;
  source_anchor: string | null;
  source_snapshot_text: string | null;
  source_label: string | null;
  comment_source: 'qir' | 'agenda';
  comment_id: string | null;
  comment_text_snapshot: string;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  queue_status: ReportQueueStatus;
  agenda_insertion_mode: ReportQueueInsertionMode | null;
  linked_footnote_id: string | null;
  linked_ref_id: string | null;
}

export interface PromoteToQueueInput {
  reportTab?: string | null;
  sourceType: ReportQueueSourceType;
  sourceId?: string | null;
  sourceAnchor?: string | null;
  sourceSnapshotText?: string | null;
  sourceLabel?: string | null;
  commentSource: 'qir' | 'agenda';
  commentId?: string | null;
  commentTextSnapshot: string;
}

/**
 * Shared queue of report comments staged for inclusion in the Agenda.
 * Scoped by company + reporting period (month/quarter).
 */
export function useReportAgendaQueue() {
  const { user } = useAuth();
  const { company } = useCompany();
  const tf = useInsightsTimeframeOptional();
  const period = tf?.reportingPeriod ?? reportingPeriodHelpers.defaultReportingPeriod('quarter');
  const periodType = period.view as 'month' | 'quarter';
  const periodKey = period.period;
  const userId = user?.id;

  const [items, setItems] = useState<ReportQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company?.id || !userId) { setItems([]); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('report_agenda_queue' as any)
        .select('*')
        .eq('company_id', company.id)
        .eq('created_by', userId)
        .eq('period_type', periodType)
        .eq('period_key', periodKey)
        .order('created_at', { ascending: false });
      if (!alive) return;
      if (!error && data) setItems(data as unknown as ReportQueueItem[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [company?.id, userId, periodType, periodKey]);

  useEffect(() => {
    if (!company?.id || !userId) return;
    const ch = supabase
      .channel(`report-queue-${company.id}-${periodType}-${periodKey}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'report_agenda_queue',
        filter: `company_id=eq.${company.id}`,
      }, (payload) => {
        const row = (payload.new || payload.old) as any;
        if (!row) return;
        if (row.period_type !== periodType || row.period_key !== periodKey) return;
        // Only surface the current user's own queue rows.
        if (row.created_by !== userId) return;
        if (payload.eventType === 'INSERT') {
          setItems(prev => prev.find(i => i.id === row.id) ? prev : [row as ReportQueueItem, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setItems(prev => prev.map(i => i.id === row.id ? (row as ReportQueueItem) : i));
        } else if (payload.eventType === 'DELETE') {
          setItems(prev => prev.filter(i => i.id !== row.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [company?.id, userId, periodType, periodKey]);

  const promote = useCallback(async (input: PromoteToQueueInput): Promise<ReportQueueItem | null> => {
    if (!company?.id || !user?.id) return null;
    // Dedup on (company, comment_source, comment_id) — return existing row if present.
    if (input.commentId) {
      const { data: existing } = await supabase
        .from('report_agenda_queue' as any)
        .select('*')
        .eq('company_id', company.id)
        .eq('comment_source', input.commentSource)
        .eq('comment_id', input.commentId)
        .maybeSingle();
      if (existing) return existing as unknown as ReportQueueItem;
    }
    const authorName = (user.user_metadata as any)?.full_name
      || (user.user_metadata as any)?.name
      || user.email || null;
    const { data, error } = await supabase
      .from('report_agenda_queue' as any)
      .insert({
        company_id: company.id,
        period_type: periodType,
        period_key: periodKey,
        report_tab: input.reportTab ?? null,
        source_type: input.sourceType,
        source_id: input.sourceId ?? null,
        source_anchor: input.sourceAnchor ?? null,
        source_snapshot_text: input.sourceSnapshotText?.slice(0, 4000) ?? null,
        source_label: input.sourceLabel ?? null,
        comment_source: input.commentSource,
        comment_id: input.commentId ?? null,
        comment_text_snapshot: input.commentTextSnapshot.slice(0, 4000),
        created_by: user.id,
        created_by_name: authorName,
        queue_status: 'queued',
      })
      .select('*')
      .single();
    if (error) {
      console.error('[promoteToQueue]', error);
      return null;
    }
    const row = data as unknown as ReportQueueItem;
    setItems(prev => prev.find(i => i.id === row.id) ? prev : [row, ...prev]);
    return row;
  }, [company?.id, user, periodType, periodKey]);

  const updateItem = useCallback(async (id: string, patch: Partial<ReportQueueItem>) => {
    if (!company?.id) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    const { error } = await supabase
      .from('report_agenda_queue' as any)
      .update(patch as any)
      .eq('id', id);
    if (error) console.error('[updateQueueItem]', error);
  }, [company?.id]);

  /**
   * Hard-delete a queue row. Used by the Queue dropdown / Agenda Queue panel
   * trash actions so users can fully remove a comment from their queue.
   * NOTE: this only removes the queue staging row, not the underlying
   * qir_comment / agenda_comment.
   */
  const removeItem = useCallback(async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    const { error } = await supabase
      .from('report_agenda_queue' as any)
      .delete()
      .eq('id', id);
    if (error) console.error('[removeQueueItem]', error);
  }, []);

  const counts = useMemo(() => {
    let queued = 0, added = 0, dismissed = 0, archived = 0;
    for (const i of items) {
      if (i.queue_status === 'queued') queued++;
      else if (i.queue_status === 'added_to_agenda') added++;
      else if (i.queue_status === 'dismissed') dismissed++;
      else if (i.queue_status === 'archived') archived++;
    }
    return { queued, added, dismissed, archived, total: items.length };
  }, [items]);

  return { items, loading, promote, updateItem, removeItem, counts, periodType, periodKey };
}