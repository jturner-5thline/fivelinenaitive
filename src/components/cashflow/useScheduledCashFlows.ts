import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ScheduledCashFlow } from './scheduledCashFlows';

export function useScheduledCashFlows(companyId: string | undefined) {
  const [items, setItems] = useState<ScheduledCashFlow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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

  const saveAll = useCallback(async (entries: ScheduledCashFlow[]) => {
    if (!companyId) return false;
    // Strategy: replace all entries for this company
    const { data: userResp } = await supabase.auth.getUser();
    const userId = userResp?.user?.id ?? null;

    const { error: delErr } = await supabase
      .from('scheduled_cash_flows' as any)
      .delete()
      .eq('company_id', companyId);
    if (delErr) {
      console.error('Error clearing scheduled cash flows:', delErr);
      return false;
    }

    if (entries.length === 0) {
      await fetchItems();
      return true;
    }

    const payload = entries.map((e) => ({
      company_id: companyId,
      created_by: userId,
      account: e.account,
      category: e.category,
      amount: e.amount,
      frequency_type: e.frequency_type,
      frequency_config: e.frequency_config || {},
      flow_type: e.flow_type,
      start_date: e.start_date,
      end_date: e.end_date,
      notes: e.notes,
    }));

    const { error: insErr } = await supabase
      .from('scheduled_cash_flows' as any)
      .insert(payload as any);
    if (insErr) {
      console.error('Error saving scheduled cash flows:', insErr);
      return false;
    }
    await fetchItems();
    return true;
  }, [companyId, fetchItems]);

  return { items, isLoading, fetchItems, saveAll };
}
