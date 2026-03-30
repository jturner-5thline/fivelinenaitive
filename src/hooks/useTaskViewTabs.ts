import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';

export interface TaskTabFilterConfig {
  has_deal?: boolean;
  has_lender?: boolean;
  has_crm_company?: boolean;
  specific_deal_id?: string;
  specific_lender_id?: string;
  created_by_me?: boolean;
  assigned_to_me?: boolean;
  tags?: string[];
}

export interface TaskViewTab {
  id: string;
  user_id: string;
  company_id: string | null;
  name: string;
  filter_config: TaskTabFilterConfig;
  sort_order: number;
  icon: string | null;
  is_default: boolean;
  created_at: string;
}

const TABS_KEY = ['task-view-tabs'];

const DEFAULT_TABS: Omit<TaskViewTab, 'id' | 'user_id' | 'company_id' | 'created_at'>[] = [
  { name: 'All Tasks', filter_config: {}, sort_order: 0, icon: 'list-todo', is_default: true },
  { name: 'Deal Tasks', filter_config: { has_deal: true }, sort_order: 1, icon: 'briefcase', is_default: true },
  { name: 'Lender Tasks', filter_config: { has_lender: true }, sort_order: 2, icon: 'landmark', is_default: true },
  { name: 'Company Tasks', filter_config: { has_crm_company: true }, sort_order: 3, icon: 'folder', is_default: true },
  { name: 'Personal', filter_config: { has_deal: false, has_lender: false }, sort_order: 4, icon: 'user', is_default: true },
];

export function useTaskViewTabs() {
  const { user } = useAuth();
  const { company } = useCompany();
  const queryClient = useQueryClient();

  const { data: tabs = [], isLoading } = useQuery({
    queryKey: TABS_KEY,
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('task_view_tabs' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('sort_order', { ascending: true });
      if (error) throw error;

      // If no tabs exist, seed defaults
      if (!data || data.length === 0) {
        const defaults = DEFAULT_TABS.map(t => ({
          ...t,
          user_id: user.id,
          company_id: company?.id || null,
        }));
        const { data: seeded, error: seedError } = await supabase
          .from('task_view_tabs' as any)
          .insert(defaults)
          .select();
        if (seedError) throw seedError;
        return (seeded || []) as unknown as TaskViewTab[];
      }

      return data as unknown as TaskViewTab[];
    },
  });

  const createTab = useMutation({
    mutationFn: async (tab: { name: string; filter_config: TaskTabFilterConfig; icon?: string }) => {
      if (!user) throw new Error('Not authenticated');
      const maxSort = tabs.length > 0 ? Math.max(...tabs.map(t => t.sort_order)) + 1 : 0;
      const { data, error } = await supabase
        .from('task_view_tabs' as any)
        .insert({
          user_id: user.id,
          company_id: company?.id || null,
          name: tab.name,
          filter_config: tab.filter_config,
          sort_order: maxSort,
          icon: tab.icon || null,
          is_default: false,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TABS_KEY });
      toast.success('Tab created');
    },
    onError: () => toast.error('Failed to create tab'),
  });

  const updateTab = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; filter_config?: TaskTabFilterConfig; icon?: string | null; sort_order?: number }) => {
      const { error } = await supabase
        .from('task_view_tabs' as any)
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TABS_KEY }),
    onError: () => toast.error('Failed to update tab'),
  });

  const deleteTab = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('task_view_tabs' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TABS_KEY });
      toast.success('Tab deleted');
    },
    onError: () => toast.error('Failed to delete tab'),
  });

  const reorderTabs = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, i) =>
        supabase.from('task_view_tabs' as any).update({ sort_order: i }).eq('id', id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TABS_KEY }),
  });

  return {
    tabs,
    isLoading,
    createTab,
    updateTab,
    deleteTab,
    reorderTabs,
  };
}
