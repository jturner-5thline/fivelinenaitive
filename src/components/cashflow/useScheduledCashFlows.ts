import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ScheduledCashFlow } from './scheduledCashFlows';

export function useScheduledCashFlows(companyId: string | undefined) {
  const [items, setItems] = useState<ScheduledCashFlow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // Always-fresh ref to current items so callbacks (and concurrent saves)
  // never operate on a stale snapshot. The previous "delete-all then insert"
  // strategy could silently destroy entries when the caller passed a stale
  // list (e.g. an inline add racing with a Configure modal save), since both
  // paths called saveAll with their own captured list. Diff-based persistence
  // below avoids the wipe entirely.
  const itemsRef = useRef<ScheduledCashFlow[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const fetchItems = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('scheduled_cash_flows' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      if (error) {
        console.error('Error loading scheduled cash flows:', error);
        setItems([]);
      } else {
        setItems((data as any as ScheduledCashFlow[]) || []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  /**
   * Diff-based persistence — never wipes the whole table.
   *
   *  - Entries with no `id` (or an empty/placeholder id) → INSERT
   *  - Entries with an existing `id` → UPDATE
   *  - Only ids passed in `deleteIds` are removed
   *
   * Critically, an entry NEVER gets deleted just because it's missing from
   * `entries`. Callers must explicitly opt in to deletion via `deleteIds`.
   * This protects against stale snapshots — e.g. the Configure modal loaded
   * its drafts before a separate inline-add added a new row; saving the
   * modal must not erase that new row.
   */
  const saveAll = useCallback(async (
    entries: ScheduledCashFlow[],
    deleteIds: string[] = [],
  ) => {
    if (!companyId) return false;
    const { data: userResp } = await supabase.auth.getUser();
    const userId = userResp?.user?.id ?? null;

    const toInsert: any[] = [];
    const toUpdate: { id: string; row: any }[] = [];

    for (const e of entries) {
      const row: any = {
        account: e.account,
        category: e.category,
        amount: e.amount,
        frequency_type: e.frequency_type,
        frequency_config: e.frequency_config || {},
        flow_type: e.flow_type,
        start_date: e.start_date,
        end_date: e.end_date,
        notes: e.notes,
      };
      if (e.id) {
        toUpdate.push({ id: e.id, row });
      } else {
        toInsert.push({ company_id: companyId, created_by: userId, ...row });
      }
    }

    const toDeleteIds = deleteIds.filter(Boolean);

    // INSERTs
    if (toInsert.length > 0) {
      const { error: insErr } = await supabase
        .from('scheduled_cash_flows' as any)
        .insert(toInsert as any);
      if (insErr) {
        console.error('Error inserting scheduled cash flows:', insErr);
        return false;
      }
    }

    // UPDATEs (one round-trip per row — typically only a handful change)
    for (const u of toUpdate) {
      const { error: updErr } = await supabase
        .from('scheduled_cash_flows' as any)
        .update(u.row)
        .eq('id', u.id)
        .eq('company_id', companyId);
      if (updErr) {
        console.error('Error updating scheduled cash flow', u.id, updErr);
        return false;
      }
    }

    // DELETEs only for explicitly-removed ids
    if (toDeleteIds.length > 0) {
      const { error: delErr } = await supabase
        .from('scheduled_cash_flows' as any)
        .delete()
        .in('id', toDeleteIds)
        .eq('company_id', companyId);
      if (delErr) {
        console.error('Error deleting scheduled cash flows:', delErr);
        return false;
      }
    }

    await fetchItems();
    return true;
  }, [companyId, fetchItems]);

  /**
   * Append a single new entry without touching anything else. Safe against
   * stale closures — the caller does NOT need to pass the full list.
   */
  const addItem = useCallback(
    async (entry: Omit<ScheduledCashFlow, 'id' | 'company_id'>) => {
      if (!companyId) return false;
      const { data: userResp } = await supabase.auth.getUser();
      const userId = userResp?.user?.id ?? null;
      const payload = {
        company_id: companyId,
        created_by: userId,
        account: entry.account,
        category: entry.category,
        amount: entry.amount,
        frequency_type: entry.frequency_type,
        frequency_config: entry.frequency_config || {},
        flow_type: entry.flow_type,
        start_date: entry.start_date,
        end_date: entry.end_date,
        notes: entry.notes,
      };
      const { error } = await supabase
        .from('scheduled_cash_flows' as any)
        .insert(payload as any);
      if (error) {
        console.error('Error adding scheduled cash flow:', error);
        return false;
      }
      await fetchItems();
      return true;
    },
    [companyId, fetchItems],
  );

  return { items, isLoading, fetchItems, saveAll, addItem };
}
