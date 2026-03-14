import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export interface SyncScheduleSettings {
  qb_enabled: boolean;
  hs_enabled: boolean;
  interval_hours: number;
  last_qb_sync: string | null;
  last_hs_sync: string | null;
}

export function useSyncSchedule() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['sync-schedule-settings'],
    queryFn: async (): Promise<SyncScheduleSettings> => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-scheduler`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({ action: 'get-settings' }),
        }
      );

      if (!response.ok) throw new Error('Failed to fetch sync settings');
      const data = await response.json();
      return data.settings;
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (settings: Partial<SyncScheduleSettings>) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-scheduler`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({ action: 'update-settings', ...settings }),
        }
      );

      if (!response.ok) throw new Error('Failed to update sync settings');
      const data = await response.json();
      return data.settings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-schedule-settings'] });
      toast({ title: 'Sync schedule updated' });
    },
    onError: (e: Error) => {
      toast({ title: 'Error updating sync schedule', description: e.message, variant: 'destructive' });
    },
  });

  return {
    settings: query.data,
    isLoading: query.isLoading,
    updateSettings,
  };
}
