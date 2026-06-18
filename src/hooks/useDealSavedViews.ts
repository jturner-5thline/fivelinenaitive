import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DealFilters, SortField, SortDirection } from '@/hooks/useDeals';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface DealViewConfig {
  filters: DealFilters;
  sortField: SortField;
  sortDirection: SortDirection;
  viewMode: 'grid' | 'list' | 'pipeline' | 'timeline';
  /** null means "no grouping" — never coerce to a default. */
  groupBy: string | null;
  /** Group keys the user has collapsed. */
  collapsedGroups?: string[];
}

export interface DealSavedView {
  id: string;
  name: string;
  config: DealViewConfig;
  isDefault: boolean;
  createdAt: string;
}

const QUERY_KEY = ['deal-saved-views'] as const;

function rowToView(row: any): DealSavedView {
  return {
    id: row.id,
    name: row.name,
    config: row.config as DealViewConfig,
    isDefault: !!row.is_default,
    createdAt: row.created_at,
  };
}

export function useDealSavedViews() {
  const { user } = useAuth();
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const queryClient = useQueryClient();

  const { data: views = [], isLoading } = useQuery({
    queryKey: [...QUERY_KEY, companyId],
    enabled: !!companyId,
    queryFn: async () => {
      if (!companyId) return [] as DealSavedView[];
      const { data, error } = await (supabase as any)
        .from('deal_saved_views')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(rowToView);
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [...QUERY_KEY, companyId] });

  const saveView = useCallback(async (name: string, config: DealViewConfig) => {
    if (!user || !companyId) {
      toast.error('Sign in to save views');
      return null;
    }
    const { data, error } = await (supabase as any)
      .from('deal_saved_views')
      .insert({
        company_id: companyId,
        created_by: user.id,
        name: name.trim(),
        config,
      })
      .select()
      .single();
    if (error) {
      toast.error('Failed to save view');
      return null;
    }
    toast.success(`View "${name.trim()}" saved`);
    invalidate();
    return rowToView(data);
  }, [user, companyId]);

  const deleteView = useCallback(async (id: string) => {
    const { error } = await (supabase as any)
      .from('deal_saved_views')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error('Failed to delete view');
      return;
    }
    toast.success('View deleted');
    invalidate();
  }, [companyId]);

  const setDefault = useCallback(async (id: string | null) => {
    if (!companyId) return;
    // Clear any existing default in this company first.
    const { error: clearErr } = await (supabase as any)
      .from('deal_saved_views')
      .update({ is_default: false })
      .eq('company_id', companyId)
      .eq('is_default', true);
    if (clearErr) {
      toast.error('Failed to update default');
      return;
    }
    if (id) {
      const { error } = await (supabase as any)
        .from('deal_saved_views')
        .update({ is_default: true })
        .eq('id', id);
      if (error) {
        toast.error('Failed to set default');
        return;
      }
      toast.success('Default view set');
    }
    invalidate();
  }, [companyId]);

  const clearDefaultView = useCallback(async () => {
    if (!companyId) return;
    await (supabase as any)
      .from('deal_saved_views')
      .update({ is_default: false })
      .eq('company_id', companyId)
      .eq('is_default', true);
    invalidate();
  }, [companyId]);

  const clearAllViews = useCallback(async () => {
    if (!companyId) return;
    await (supabase as any)
      .from('deal_saved_views')
      .delete()
      .eq('company_id', companyId);
    invalidate();
  }, [companyId]);

  const getDefaultView = useCallback((): DealSavedView | undefined => {
    return views.find(v => v.isDefault);
  }, [views]);

  return {
    views,
    isLoaded: !!companyId && !isLoading,
    saveView,
    deleteView,
    setDefault,
    clearDefaultView,
    clearAllViews,
    getDefaultView,
  };
}
