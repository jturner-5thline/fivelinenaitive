import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Bridges the Data-Room checklist UI with the deal's `outstanding_items` table.
 *
 * Linkage uses the SAME key scheme as `autoPopulateOutstandingItems`:
 *   key = `${normalizeKey(round_title)}::${itemKey(label)}`
 * where:
 *   normalizeKey = lowercase + strip spaces  ("Kick Off" → "kickoff")
 *   itemKey      = lowercase + strip non-alphanumerics
 *
 * Status semantics ({"received":bool,"approved":bool,...}):
 *   complete  ⇔ received === true && approved === true
 */

export function normalizeRoundKey(t: string): string {
  return (t || '').toLowerCase().replace(/\s+/g, '');
}
export function checklistItemKey(label: string): string {
  return (label || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}
export function buildChecklistKey(roundTitle: string, label: string): string {
  return `${normalizeRoundKey(roundTitle)}::${checklistItemKey(label)}`;
}

interface OutstandingRow {
  id: string;
  description: string;
  status: string;
  source_metadata: Record<string, unknown> | null;
}

interface SyncedItem {
  id: string;
  description: string;
  received: boolean;
  approved: boolean;
  complete: boolean;
}

function parseStatus(s: string): { received: boolean; approved: boolean; deliveredToLenders: string[]; requestedBy: string[] } {
  try {
    const p = JSON.parse(s) || {};
    return {
      received: !!p.received,
      approved: !!p.approved,
      deliveredToLenders: p.deliveredToLenders ?? [],
      requestedBy: p.requestedBy ?? [],
    };
  } catch {
    return { received: false, approved: false, deliveredToLenders: [], requestedBy: [] };
  }
}

function buildStatus(p: { received: boolean; approved: boolean; deliveredToLenders?: string[]; requestedBy?: string[] }): string {
  return JSON.stringify({
    received: !!p.received,
    approved: !!p.approved,
    deliveredToLenders: p.deliveredToLenders ?? [],
    requestedBy: p.requestedBy ?? [],
  });
}

export function useDealOutstandingItemsByKey(dealId: string | undefined) {
  const { user } = useAuth();
  const [rows, setRows] = useState<OutstandingRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    if (!dealId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('outstanding_items')
      .select('id, description, status, source_metadata')
      .eq('deal_id', dealId);
    if (error) {
      console.error('useDealOutstandingItemsByKey fetch error:', error);
      setRows([]);
    } else {
      setRows((data || []) as OutstandingRow[]);
    }
    setLoading(false);
  }, [dealId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Realtime: keep checklist UI in sync when items change anywhere
  useEffect(() => {
    if (!dealId) return;
    const channel = supabase
      .channel(`outstanding-items-by-key-${dealId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'outstanding_items', filter: `deal_id=eq.${dealId}` },
        () => fetchRows()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealId, fetchRows]);

  /** Map of `${normalizeRoundKey}::${itemKey}` → SyncedItem */
  const byKey = useMemo(() => {
    const m = new Map<string, SyncedItem>();
    const fallbackByDescription = new Map<string, OutstandingRow>();
    for (const r of rows) {
      const meta = (r.source_metadata || {}) as Record<string, unknown>;
      const round = (meta.source_round as string) || '';
      const itemKey = (meta.source_item_key as string) || '';
      if (round && itemKey) {
        const k = `${normalizeRoundKey(round)}::${itemKey}`;
        const st = parseStatus(r.status);
        m.set(k, {
          id: r.id,
          description: r.description,
          received: st.received,
          approved: st.approved,
          complete: st.received && st.approved,
        });
      }
      // index by normalized description as a fallback so manually-added items still link
      fallbackByDescription.set(checklistItemKey(r.description), r);
    }
    // Layer fallback in for any keys not already populated by metadata
    return { byKey: m, fallbackByDescription };
  }, [rows]);

  /** Lookup helper using round title + label, with description fallback. */
  const lookup = useCallback(
    (roundTitle: string, label: string): SyncedItem | null => {
      const k = buildChecklistKey(roundTitle, label);
      const direct = byKey.byKey.get(k);
      if (direct) return direct;
      const fallback = byKey.fallbackByDescription.get(checklistItemKey(label));
      if (!fallback) return null;
      const st = parseStatus(fallback.status);
      return {
        id: fallback.id,
        description: fallback.description,
        received: st.received,
        approved: st.approved,
        complete: st.received && st.approved,
      };
    },
    [byKey]
  );

  /**
   * Set checked/unchecked for a checklist item, updating (or creating) the
   * linked outstanding item.
   *
   * Optimistically updates local rows so the checkbox flips immediately.
   */
  const setChecked = useCallback(
    async (
      params: { roundTitle: string; label: string; dealTypeMatch?: string | null },
      checked: boolean
    ): Promise<boolean> => {
      if (!dealId || !user) return false;
      const { roundTitle, label, dealTypeMatch } = params;
      const existing = lookup(roundTitle, label);

      // ── Update existing row ─────────────────────────────────
      if (existing) {
        const newStatus = buildStatus({ received: checked, approved: checked });
        // Optimistic
        setRows(prev => prev.map(r => (r.id === existing.id ? { ...r, status: newStatus } : r)));
        const { error } = await supabase
          .from('outstanding_items')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) {
          console.error('setChecked update error:', error);
          toast.error('Could not update outstanding item');
          fetchRows();
          return false;
        }
        return true;
      }

      // ── No linked outstanding item yet — create one ─────────
      // Create the row in either state so that an "uncheck" on an auto-mapped
      // (file-derived) item still persists as an explicit override.
      // Find next position
      const { data: posData } = await supabase
        .from('outstanding_items')
        .select('position')
        .eq('deal_id', dealId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextPosition = (posData?.position ?? -1) + 1;

      const status = buildStatus({
        received: checked,
        approved: checked,
        requestedBy: ['5th Line'],
      });
      const sourceMetadata = {
        source_type: 'data_room_checklist',
        source_round: roundTitle,
        source_deal_type_match: dealTypeMatch || '',
        source_item_key: checklistItemKey(label),
      };

      const { data, error } = await supabase
        .from('outstanding_items')
        .insert({
          deal_id: dealId,
          description: label,
          status,
          user_id: user.id,
          priority: 'normal',
          position: nextPosition,
          notes: `Auto-created from Data Room checklist — ${roundTitle}`,
          source_metadata: sourceMetadata,
        })
        .select('id, description, status, source_metadata')
        .single();

      if (error) {
        console.error('setChecked insert error:', error);
        toast.error('Could not link checklist item to outstanding items');
        return false;
      }
      setRows(prev => [...prev, data as OutstandingRow]);
      return true;
    },
    [dealId, user, lookup, fetchRows]
  );

  return {
    loading,
    rows,
    lookup,
    setChecked,
    refresh: fetchRows,
  };
}