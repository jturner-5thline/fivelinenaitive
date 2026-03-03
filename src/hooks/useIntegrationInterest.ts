import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export function useIntegrationInterest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: interests = [] } = useQuery({
    queryKey: ['integration-interest', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('integration_interest')
        .select('integration_key')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data || []).map((d: any) => d.integration_key as string);
    },
    enabled: !!user,
  });

  const notifyMe = useMutation({
    mutationFn: async (integrationKey: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('integration_interest')
        .insert({ user_id: user.id, integration_key: integrationKey });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-interest'] });
      toast.success("We'll notify you when this integration launches!");
    },
    onError: () => {
      toast.error('Failed to register interest');
    },
  });

  return { interests, notifyMe };
}
