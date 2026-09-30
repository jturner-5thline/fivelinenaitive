import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { useAuth } from '@/contexts/AuthContext';

export interface CrmColumnDef {
  id: string;
  label: string;
}

/**
 * Account-wide column order + visibility for CRM tables (Companies, Contacts).
 * Stored per org in `crm_table_layouts`; realtime keeps every teammate in sync.
 */
export function useCrmTableColumns(tableKey: string, columns: CrmColumnDef[]) {
  const { company } = useCompany();
  const { user } = useAuth();
  const allIds = useMemo(() => columns.map(c => c.id), [columns]);
  const [order, setOrder] = useState<string[]>(allIds);
  const [hidden, setHidden] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const allIdsRef = useRef(allIds);
  allIdsRef.current = allIds;

  const apply = useCallback((savedOrder: string[] | null, savedHidden: string[] | null) => {
    const ids = allIdsRef.current;
    const o = (savedOrder ?? []).filter(id => ids.includes(id));
    setOrder([...o, ...ids.filter(id => !o.includes(id))]);
    setHidden((savedHidden ?? []).filter(id => ids.includes(id)));
  }, []);

  const load = useCallback(async () => {
    if (!company?.id) return;
    const { data } = await supabase
      .from('crm_table_layouts')
      .select('column_order, hidden_columns')
      .eq('company_id', company.id)
      .eq('table_key', tableKey)
      .maybeSingle();
    apply(data?.column_order ?? null, data?.hidden_columns ?? null);
    setIsLoaded(true);
  }, [company?.id, tableKey, apply]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!company?.id) return;
    const channel = supabase
      .channel(`crm-table-layout:${company.id}:${tableKey}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'crm_table_layouts', filter: `company_id=eq.${company.id}` },
        (payload: any) => {
          const row = payload.new;
          if (row?.table_key === tableKey) apply(row.column_order, row.hidden_columns);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [company?.id, tableKey, apply]);

  const persist = useCallback(async (nextOrder: string[], nextHidden: string[]) => {
    setOrder(nextOrder);
    setHidden(nextHidden);
    if (!company?.id || !isLoaded) return;
    const { error } = await supabase.from('crm_table_layouts').upsert({
      company_id: company.id,
      table_key: tableKey,
      column_order: nextOrder,
      hidden_columns: nextHidden,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,table_key' });
    if (error) console.error('Failed to save column layout', error);
  }, [company?.id, tableKey, user?.id, isLoaded]);

  const setColumnOrder = useCallback((next: string[]) => persist(next, hidden), [persist, hidden]);
  const toggleColumn = useCallback((id: string) => {
    const next = hidden.includes(id) ? hidden.filter(h => h !== id) : [...hidden, id];
    // Always keep at least one column visible
    if (next.length >= allIdsRef.current.length) return;
    persist(order, next);
  }, [persist, hidden, order]);
  const showAll = useCallback(() => persist(order, []), [persist, order]);
  const reset = useCallback(() => persist(allIdsRef.current, []), [persist]);

  const visibleOrder = useMemo(() => order.filter(id => !hidden.includes(id)), [order, hidden]);

  return { order, hidden, visibleOrder, isLoaded, setColumnOrder, toggleColumn, showAll, reset };
}
