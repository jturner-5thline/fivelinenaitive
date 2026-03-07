import { useState, useCallback } from 'react';
import { DealFilters, SortField, SortDirection } from '@/hooks/useDeals';
import { toast } from 'sonner';

export interface DealViewConfig {
  filters: DealFilters;
  sortField: SortField;
  sortDirection: SortDirection;
  viewMode: 'grid' | 'list' | 'pipeline' | 'timeline';
  groupBy: string | null;
}

export interface DealSavedView {
  id: string;
  name: string;
  config: DealViewConfig;
  isDefault: boolean;
  createdAt: string;
}

const STORAGE_KEY = 'deals-saved-views';

function loadViews(): DealSavedView[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function persistViews(views: DealSavedView[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

export function useDealSavedViews() {
  const [views, setViews] = useState<DealSavedView[]>(loadViews);

  const saveView = useCallback((name: string, config: DealViewConfig) => {
    const view: DealSavedView = {
      id: crypto.randomUUID(),
      name: name.trim(),
      config,
      isDefault: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [...views, view];
    setViews(updated);
    persistViews(updated);
    toast.success(`View "${view.name}" saved`);
    return view;
  }, [views]);

  const deleteView = useCallback((id: string) => {
    const updated = views.filter(v => v.id !== id);
    setViews(updated);
    persistViews(updated);
    toast.success('View deleted');
  }, [views]);

  const setDefault = useCallback((id: string | null) => {
    const updated = views.map(v => ({ ...v, isDefault: v.id === id }));
    setViews(updated);
    persistViews(updated);
    if (id) {
      toast.success('Default view set');
    }
  }, [views]);

  const getDefaultView = useCallback((): DealSavedView | undefined => {
    return views.find(v => v.isDefault);
  }, [views]);

  return { views, saveView, deleteView, setDefault, getDefaultView };
}
