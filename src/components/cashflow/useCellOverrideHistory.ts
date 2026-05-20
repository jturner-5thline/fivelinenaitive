import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type OverrideHistoryEntry = {
  id: string;
  company_id: string;
  week_key: string;
  field: 'beginningCash' | 'endingCash' | 'addlLiquidity' | string;
  previous_value: number | null;
  new_value: number | null;
  changed_by: string | null;
  changed_by_email: string | null;
  changed_by_name: string | null;
  changed_at: string;
};

export function cellHistoryKey(weekKey: string, field: string): string {
  return `${weekKey}::${field}`;
}

/**
 * Loads + subscribes to the company-scoped manual-override audit trail
 * (`cash_flow_override_history`). Exposes a map keyed by
 * `${weekKey}::${field}` whose values are entries sorted newest-first,
 * plus a `record(...)` helper that inserts a row for the current user.
 */
export function useCellOverrideHistory(companyId?: string | null) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<OverrideHistoryEntry[]>([]);
  const lastLoadedCompanyRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!companyId) {
      setEntries([]);
      return;
    }
    const { data, error } = await supabase
      .from('cash_flow_override_history' as any)
      .select('*')
      .eq('company_id', companyId)
      .order('changed_at', { ascending: false })
      .limit(2000);
    if (error) {
      console.error('[useCellOverrideHistory] load failed', error);
      return;
    }
    setEntries(((data as any) || []) as OverrideHistoryEntry[]);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    if (lastLoadedCompanyRef.current === companyId) return;
    lastLoadedCompanyRef.current = companyId;
    void refresh();
  }, [companyId, refresh]);

  // Realtime: new audit rows from other clients append in-place.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`cash_flow_override_history:${companyId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cash_flow_override_history',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          const row = payload.new as OverrideHistoryEntry;
          setEntries((prev) =>
            prev.some((e) => e.id === row.id) ? prev : [row, ...prev],
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId]);

  const byCell = useMemo(() => {
    const map: Record<string, OverrideHistoryEntry[]> = {};
    for (const e of entries) {
      const k = cellHistoryKey(e.week_key, e.field);
      (map[k] ||= []).push(e);
    }
    // Already sorted newest-first by query, but keep guarantee on insert merges.
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => b.changed_at.localeCompare(a.changed_at));
    }
    return map;
  }, [entries]);

  const record = useCallback(
    async (args: {
      weekKey: string;
      field: string;
      previousValue: number | null;
      newValue: number | null;
    }) => {
      if (!companyId) return;
      const changedByEmail = user?.email ?? null;
      const meta = (user?.user_metadata as Record<string, unknown> | undefined) ?? {};
      const changedByName =
        (typeof meta.full_name === 'string' && (meta.full_name as string)) ||
        (typeof meta.name === 'string' && (meta.name as string)) ||
        null;
      const row = {
        company_id: companyId,
        week_key: args.weekKey,
        field: args.field,
        previous_value:
          args.previousValue === null || Number.isNaN(args.previousValue)
            ? null
            : Math.round(args.previousValue),
        new_value:
          args.newValue === null || Number.isNaN(args.newValue)
            ? null
            : Math.round(args.newValue),
        changed_by: user?.id ?? null,
        changed_by_email: changedByEmail,
        changed_by_name: changedByName,
      };
      const { data, error } = await supabase
        .from('cash_flow_override_history' as any)
        .insert(row as any)
        .select('*')
        .single();
      if (error) {
        console.error('[useCellOverrideHistory] insert failed', error);
        return;
      }
      const inserted = data as unknown as OverrideHistoryEntry;
      setEntries((prev) =>
        prev.some((e) => e.id === inserted.id) ? prev : [inserted, ...prev],
      );
    },
    [companyId, user?.id, user?.email, user?.user_metadata],
  );

  return { entries, byCell, refresh, record };
}
