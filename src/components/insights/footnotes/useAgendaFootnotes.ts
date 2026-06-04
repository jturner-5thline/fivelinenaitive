import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { AgendaFootnote, InsertFootnoteInput } from './types';

interface Options {
  companyId: string | null | undefined;
  periodType: 'month' | 'quarter';
  periodKey: string;
}

/**
 * Loads and manages canonical footnotes for the active company + reporting
 * period. Realtime-aware so multiple users on the same period see updates.
 */
export function useAgendaFootnotes({ companyId, periodType, periodKey }: Options) {
  const { user } = useAuth();
  const [footnotes, setFootnotes] = useState<AgendaFootnote[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!companyId) {
      setFootnotes([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('insights_agenda_footnotes' as any)
        .select('*')
        .eq('company_id', companyId)
        .eq('agenda_period_type', periodType)
        .eq('agenda_period_key', periodKey)
        .eq('status', 'active')
        .order('created_at', { ascending: true });
      if (error) {
        console.error('[agenda_footnotes] fetch', error);
        setFootnotes([]);
        return;
      }
      setFootnotes((data as any) || []);
    } finally {
      setLoading(false);
    }
  }, [companyId, periodType, periodKey]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`agenda_footnotes:${companyId}:${periodType}:${periodKey}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'insights_agenda_footnotes', filter: `company_id=eq.${companyId}` },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          if (!row) return;
          if (row.agenda_period_type !== periodType || row.agenda_period_key !== periodKey) return;
          if (payload.eventType === 'DELETE') {
            setFootnotes((prev) => prev.filter((f) => f.id !== row.id));
            return;
          }
          setFootnotes((prev) => {
            const idx = prev.findIndex((f) => f.id === row.id);
            const next: AgendaFootnote = row as AgendaFootnote;
            if (next.status !== 'active') return prev.filter((f) => f.id !== next.id);
            if (idx === -1) return [...prev, next].sort((a, b) => a.created_at.localeCompare(b.created_at));
            const copy = prev.slice();
            copy[idx] = next;
            return copy;
          });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [companyId, periodType, periodKey]);

  /**
   * Upserts a canonical footnote. Reuses the existing row when source_type +
   * source_id + source_anchor match within the same period, unless caller
   * passes `duplicate: true`.
   */
  const upsertFootnote = useCallback(
    async (input: InsertFootnoteInput): Promise<AgendaFootnote | null> => {
      if (!companyId || !user?.id) return null;
      // Dedup by source identity if not forcing a duplicate.
      if (!input.duplicate && input.sourceId) {
        const match = footnotes.find(
          (f) =>
            f.source_type === input.sourceType &&
            f.source_id === input.sourceId &&
            (f.source_anchor ?? null) === (input.sourceAnchor ?? null),
        );
        if (match) return match;
      }
      const anchor = input.duplicate
        ? `${input.sourceAnchor ?? ''}::${Date.now()}`
        : input.sourceAnchor ?? null;
      const { data, error } = await supabase
        .from('insights_agenda_footnotes' as any)
        .insert({
          company_id: companyId,
          agenda_period_type: periodType,
          agenda_period_key: periodKey,
          footnote_type: input.footnoteType,
          source_type: input.sourceType,
          source_id: input.sourceId ?? null,
          source_anchor: anchor,
          source_snapshot_text: input.snapshotText.slice(0, 8000),
          source_current_text: input.snapshotText.slice(0, 8000),
          source_updated_at: new Date().toISOString(),
          link_url: input.linkUrl ?? null,
          status: 'active',
          created_by: user.id,
        } as any)
        .select('*')
        .single();
      if (error) {
        console.error('[agenda_footnotes] insert', error);
        return null;
      }
      const fn = data as unknown as AgendaFootnote;
      setFootnotes((prev) => (prev.some((f) => f.id === fn.id) ? prev : [...prev, fn]));
      return fn;
    },
    [companyId, user?.id, periodType, periodKey, footnotes],
  );

  const archiveFootnote = useCallback(async (id: string) => {
    if (!companyId) return false;
    const { error } = await supabase
      .from('insights_agenda_footnotes' as any)
      .update({ status: 'archived' } as any)
      .eq('id', id);
    if (error) {
      console.error('[agenda_footnotes] archive', error);
      return false;
    }
    setFootnotes((prev) => prev.filter((f) => f.id !== id));
    return true;
  }, [companyId]);

  const byId = useMemo(() => {
    const m: Record<string, AgendaFootnote> = {};
    for (const f of footnotes) m[f.id] = f;
    return m;
  }, [footnotes]);

  return { footnotes, byId, loading, upsertFootnote, archiveFootnote, refresh: fetchAll };
}