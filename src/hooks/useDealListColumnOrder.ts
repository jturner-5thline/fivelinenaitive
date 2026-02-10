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
  | 'totalHours'
  | 'revenuePerHour'
  | 'lateMilestones'
  | 'updated';

export const ALL_COLUMNS: DealListColumnId[] = [
  'company', 'value', 'status', 'stage', 'manager', 'type', 'totalFee', 'totalHours', 'revenuePerHour', 'lateMilestones', 'updated'
];

export const DEFAULT_VISIBLE_COLUMNS: DealListColumnId[] = [
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
  totalHours: 'Total Hours',
  revenuePerHour: 'Revenue / Hour',
  lateMilestones: 'Late Milestones',
  updated: 'Updated',
};

const STORAGE_KEY = 'deal_list_column_order';
const VISIBILITY_KEY = 'deal_list_column_visibility';

interface ColumnConfig {
  order: DealListColumnId[];
  visible: DealListColumnId[];
}

export function useDealListColumnOrder() {
  const { company } = useCompany();
  const [columnOrder, setColumnOrder] = useState<DealListColumnId[]>(DEFAULT_VISIBLE_COLUMNS);
  const [visibleColumns, setVisibleColumns] = useState<Set<DealListColumnId>>(new Set(DEFAULT_VISIBLE_COLUMNS));
  const [isLoaded, setIsLoaded] = useState(false);

  // Derive active columns: ordered + visible only
  const activeColumns = columnOrder.filter(id => visibleColumns.has(id));

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
          const savedOrder = layout?.[STORAGE_KEY] as DealListColumnId[] | undefined;
          const savedVisible = layout?.[VISIBILITY_KEY] as DealListColumnId[] | undefined;

          if (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0) {
            const merged = [
              ...savedOrder.filter(id => ALL_COLUMNS.includes(id)),
              ...ALL_COLUMNS.filter(id => !savedOrder.includes(id)),
            ];
            setColumnOrder(merged);
          } else {
            setColumnOrder(ALL_COLUMNS);
          }

          if (savedVisible && Array.isArray(savedVisible)) {
            setVisibleColumns(new Set(savedVisible.filter(id => ALL_COLUMNS.includes(id))));
          }
        } catch (err) {
          console.error('Error loading column config:', err);
        }
      } else {
        try {
          const savedOrder = localStorage.getItem(STORAGE_KEY);
          const savedVisible = localStorage.getItem(VISIBILITY_KEY);
          if (savedOrder) {
            const parsed = JSON.parse(savedOrder) as DealListColumnId[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              const merged = [
                ...parsed.filter(id => ALL_COLUMNS.includes(id)),
                ...ALL_COLUMNS.filter(id => !parsed.includes(id)),
              ];
              setColumnOrder(merged);
            }
          }
          if (savedVisible) {
            const parsed = JSON.parse(savedVisible) as DealListColumnId[];
            if (Array.isArray(parsed)) {
              setVisibleColumns(new Set(parsed.filter(id => ALL_COLUMNS.includes(id))));
            }
          }
        } catch {}
      }
      setIsLoaded(true);
    }
    load();
  }, [company?.id]);

  const persist = useCallback(async (order: DealListColumnId[], visible: DealListColumnId[]) => {
    if (company?.id) {
      try {
        const { data: existing } = await supabase
          .from('company_settings')
          .select('deal_panel_layout')
          .eq('company_id', company.id)
          .maybeSingle();

        const currentLayout = (existing?.deal_panel_layout as Record<string, unknown>) || {};
        const updatedLayout = { ...currentLayout, [STORAGE_KEY]: order, [VISIBILITY_KEY]: visible };

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
        console.error('Error saving column config:', err);
      }
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
      localStorage.setItem(VISIBILITY_KEY, JSON.stringify(visible));
    }
  }, [company?.id]);

  const updateColumnOrder = useCallback(async (newOrder: DealListColumnId[]) => {
    setColumnOrder(newOrder);
    await persist(newOrder, Array.from(visibleColumns));
  }, [persist, visibleColumns]);

  const toggleColumnVisibility = useCallback(async (colId: DealListColumnId) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(colId)) {
        // Don't allow removing 'company' — always visible
        if (colId === 'company') return prev;
        next.delete(colId);
      } else {
        next.add(colId);
      }
      const newVisible = Array.from(next);
      persist(columnOrder, newVisible);
      return next;
    });
  }, [persist, columnOrder]);

  return { columnOrder, activeColumns, visibleColumns, updateColumnOrder, toggleColumnVisibility, isLoaded };
}
