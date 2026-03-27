import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/hooks/useCompany';

export function useDashboardPreference<T = any>(key: string, defaultValue: T) {
  const { user } = useAuth();
  const { company } = useCompany();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['dashboard_pref', user?.id, key],
    enabled: !!user?.id && !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_dashboard_preferences' as any)
        .select('preference_value')
        .eq('user_id', user!.id)
        .eq('preference_key', key)
        .eq('company_id', company!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as any)?.preference_value as T ?? defaultValue;
    },
  });

  const mutation = useMutation({
    mutationFn: async (value: T) => {
      const { error } = await supabase
        .from('user_dashboard_preferences' as any)
        .upsert({
          user_id: user!.id,
          preference_key: key,
          preference_value: value as any,
          company_id: company!.id,
        }, { onConflict: 'user_id,preference_key,company_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard_pref', user?.id, key] }),
  });

  return {
    value: query.data ?? defaultValue,
    isLoading: query.isLoading,
    setValue: mutation.mutate,
  };
}
