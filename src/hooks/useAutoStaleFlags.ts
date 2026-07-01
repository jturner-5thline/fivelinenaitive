import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Deal } from '@/types/deal';

/**
 * Auto-flag deals that cross the "stale" threshold.
 *
 * When a deal has had no activity (notes/updated_at) for >= `staleDays`,
 * a system flag note is inserted into `deal_flag_notes` with
 * `source = 'auto_stale'` and text like
 *   "[DEAL NAME] has had no activity in [X] days".
 *
 * When the deal is subsequently updated (no longer stale), any active
 * auto-stale flag is resolved automatically. Manual flag notes are never
 * touched by this hook.
 *
 * Runs a single reconcile pass whenever the input deal set changes.
 */
export function useAutoStaleFlags(deals: Deal[], staleDays: number) {
  const runningRef = useRef(false);
  // Serialize (deals + threshold) so we only reconcile when the meaningful
  // inputs (id + activity timestamp) change, not on every parent rerender.
  const signature = deals
    .map(d => `${d.id}:${d.notesUpdatedAt || d.updatedAt}:${d.status}:${d.stage}`)
    .join('|') + `#${staleDays}`;

  useEffect(() => {
    if (!deals.length || !staleDays || staleDays <= 0) return;
    if (runningRef.current) return;
    runningRef.current = true;
    const now = Date.now();

    const staleMap = new Map<string, { deal: Deal; days: number }>();
    const nonStaleIds = new Set<string>();

    for (const d of deals) {
      if (d.status === 'archived' || d.stage === 'closed-lost') {
        nonStaleIds.add(d.id);
        continue;
      }
      const src = d.notesUpdatedAt || d.updatedAt;
      if (!src) continue;
      const days = Math.floor((now - new Date(src).getTime()) / (1000 * 60 * 60 * 24));
      if (days >= staleDays) {
        staleMap.set(d.id, { deal: d, days });
      } else {
        nonStaleIds.add(d.id);
      }
    }

    (async () => {
      try {
        const dealIds = deals.map(d => d.id);
        const { data: existing, error } = await supabase
          .from('deal_flag_notes')
          .select('id, deal_id, note, resolved')
          .in('deal_id', dealIds)
          .eq('source', 'auto_stale')
          .eq('resolved', false);
        if (error) throw error;

        const activeByDeal = new Map<string, { id: string; note: string }[]>();
        (existing ?? []).forEach(row => {
          const arr = activeByDeal.get(row.deal_id) ?? [];
          arr.push({ id: row.id, note: row.note });
          activeByDeal.set(row.deal_id, arr);
        });

        // 1) Resolve auto-stale flags on deals that are no longer stale
        const toResolve: string[] = [];
        for (const id of nonStaleIds) {
          const rows = activeByDeal.get(id);
          if (rows?.length) rows.forEach(r => toResolve.push(r.id));
        }
        if (toResolve.length) {
          await supabase
            .from('deal_flag_notes')
            .update({ resolved: true, resolved_at: new Date().toISOString() })
            .in('id', toResolve);
        }

        // 2) Insert / refresh auto-stale flags on stale deals
        const toInsert: Array<{ deal_id: string; note: string; source: string; resolved: boolean }> = [];
        const toUpdate: Array<{ id: string; note: string }> = [];
        for (const [id, { deal, days }] of staleMap) {
          const noteText = `${deal.company} has had no activity in ${days} days`;
          const rows = activeByDeal.get(id);
          if (!rows || rows.length === 0) {
            toInsert.push({ deal_id: id, note: noteText, source: 'auto_stale', resolved: false });
          } else {
            // Keep the first, drop any duplicates, refresh text when day count drifts.
            const [keep, ...dupes] = rows;
            if (keep.note !== noteText) toUpdate.push({ id: keep.id, note: noteText });
            if (dupes.length) {
              await supabase.from('deal_flag_notes').delete().in('id', dupes.map(d => d.id));
            }
          }
        }
        if (toInsert.length) {
          await supabase.from('deal_flag_notes').insert(toInsert);
        }
        for (const u of toUpdate) {
          await supabase.from('deal_flag_notes').update({ note: u.note }).eq('id', u.id);
        }

        // 3) Sync legacy `deals.is_flagged` boolean so tile flags render.
        //    Only flip deals whose value actually changes.
        if (staleMap.size) {
          const staleIds = Array.from(staleMap.keys());
          await supabase.from('deals').update({ is_flagged: true }).in('id', staleIds);
        }
        // Deals that had their last auto-stale flag resolved and have no
        // remaining active flags should clear the boolean.
        if (toResolve.length) {
          const clearedDealIds = Array.from(nonStaleIds);
          if (clearedDealIds.length) {
            const { data: remaining } = await supabase
              .from('deal_flag_notes')
              .select('deal_id')
              .in('deal_id', clearedDealIds)
              .eq('resolved', false);
            const stillFlagged = new Set((remaining ?? []).map(r => r.deal_id));
            const clearIds = clearedDealIds.filter(id => !stillFlagged.has(id));
            if (clearIds.length) {
              await supabase.from('deals').update({ is_flagged: false }).in('id', clearIds);
            }
          }
        }
      } catch (err) {
        console.error('[useAutoStaleFlags] reconcile failed', err);
      } finally {
        runningRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}