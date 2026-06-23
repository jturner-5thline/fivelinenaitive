import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';

export interface CashInDbItem {
  id: string;
  deal_name: string;
  fee_type: string;
  amount: number;
  target_date: string;
  deal_id: string | null;
}

const FEE_LABELS: Record<string, string> = {
  retainer: 'Retainer',
  milestone: 'Milestone',
  closing: 'Closing',
};

export function useCashInItems() {
  const { company } = useCompany();
  const [items, setItems] = useState<CashInDbItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    if (!company?.id) return;
    const { data } = await supabase
      .from('cashflow_cash_in_items')
      .select('id, deal_name, fee_type, amount, target_date, deal_id')
      .eq('company_id', company.id)
      .order('target_date', { ascending: true });

    if (data) setItems(data as CashInDbItem[]);
    setLoading(false);
  }, [company?.id]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const removeItem = useCallback(async (id: string) => {
    await supabase.from('cashflow_cash_in_items').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateItem = useCallback(
    async (id: string, patch: Partial<Pick<CashInDbItem, 'amount' | 'target_date' | 'deal_name' | 'fee_type'>>) => {
      const { error } = await supabase
        .from('cashflow_cash_in_items')
        .update(patch)
        .eq('id', id);
      if (error) {
        console.error('Error updating cashflow_cash_in_items', id, error);
        return false;
      }
      await fetchItems();
      return true;
    },
    [fetchItems],
  );

  const toSidebarItems = useCallback(() => {
    return items.map(item => ({
      id: item.id,
      name: `${item.deal_name} — ${FEE_LABELS[item.fee_type] || item.fee_type}`,
      amount: item.amount,
      date: item.target_date,
    }));
  }, [items]);

  return { items, loading, fetchItems, removeItem, updateItem, toSidebarItems };
}
