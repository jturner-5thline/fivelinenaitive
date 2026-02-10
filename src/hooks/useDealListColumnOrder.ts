import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from './useCompany';

export type DealListColumnId = 
  | 'company' 
  | 'value' 
  | 'status' 
  | 'stage' 
  | 'manager' 
  | 'type' 
  | 'totalFee' 
  | 'updated';

export const DEFAULT_COLUMN_ORDER: DealListColumnId[] = [
  'company', 'value', 'status', 'stage', 'manager', 'type', 'totalFee', 'updated'
];

export const COLUMN_LABELS: Record<DealListColumnId, string> = {
  company: 'Company',
  value: 'Value',
  status: 'Status',
  stage: 'Stage',
  manager: 'Manager',
  type: 'Type',
  totalFee: 'Total Fee',
  updated: 'Updated',
};

const STORAGE_KEY = 'deal_list_column_order';

export function useDealListColumnOrder() {
  const { company } = useCompany();
  const [columnOrder, setColumnOrder] = useState<DealListColumnId[]>(DEFAULT_COLUMN_ORDER);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load column order from company_settings or localStorage
  useEffect(() => {
    async function load() {
      if (company?.id) {
        try {
          const { data } = await supabase
            .from('company_settings')
            .select('deal_panel_layout')
            .eq('company_id', company.id)
            .maybeSingle();

          const layout = data?.deal_panel_layout as Record<string, unknown> | null;
          const saved = layout?.[STORAGE_KEY] as DealListColumnId[] | undefined;
          if (saved && Array.isArray(saved) && saved.length > 0) {
            // Merge: include any new columns that weren't in saved order
            const merged = [
              ...saved.filter(id => DEFAULT_COLUMN_ORDER.includes(id)),
              ...DEFAULT_COLUMN_ORDER.filter(id => !saved.includes(id)),
            ];
            setColumnOrder(merged);
          }
        } catch (err) {
          console.error('Error loading column order:', err);
        }
      } else {
        // Fallback to localStorage
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved) as DealListColumnId[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              const merged = [
                ...parsed.filter(id => DEFAULT_COLUMN_ORDER.includes(id)),
                ...DEFAULT_COLUMN_ORDER.filter(id => !parsed.includes(id)),
              ];
              setColumnOrder(merged);
            }
          }
        } catch {}
      }
      setIsLoaded(true);
    }
    load();
  }, [company?.id]);

  const updateColumnOrder = useCallback(async (newOrder: DealListColumnId[]) => {
    setColumnOrder(newOrder);

    if (company?.id) {
      try {
        // Read current layout first to merge
        const { data: existing } = await supabase
          .from('company_settings')
          .select('deal_panel_layout')
          .eq('company_id', company.id)
          .maybeSingle();

        const currentLayout = (existing?.deal_panel_layout as Record<string, unknown>) || {};
        const updatedLayout = { ...currentLayout, [STORAGE_KEY]: newOrder };

        if (existing) {
          await supabase
            .from('company_settings')
            .update({ deal_panel_layout: updatedLayout })
            .eq('company_id', company.id);
        } else {
          await supabase
            .from('company_settings')
            .insert({ company_id: company.id, deal_panel_layout: updatedLayout });
        }
      } catch (err) {
        console.error('Error saving column order:', err);
      }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newOrder));
    }
  }, [company?.id]);

  return { columnOrder, updateColumnOrder, isLoaded };
}
