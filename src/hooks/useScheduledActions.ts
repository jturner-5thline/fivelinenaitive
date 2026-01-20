import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ScheduledAction {
  id: string;
  workflow_run_id: string | null;
  workflow_id: string;
  user_id: string;
  action_id: string;
  action_type: string;
  action_config: Record<string, any>;
  trigger_data: Record<string, any>;
  scheduled_for: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result: Record<string, any> | null;
  error_message: string | null;
  created_at: string;
  executed_at: string | null;
}

export function useScheduledActions() {
  const { user } = useAuth();
  const [scheduledActions, setScheduledActions] = useState<ScheduledAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchScheduledActions = useCallback(async () => {
    if (!user) {
      setScheduledActions([]);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('scheduled_actions')
        .select('*')
        .order('scheduled_for', { ascending: true })
        .limit(100);

      if (error) throw error;

      const transformedData: ScheduledAction[] = (data || []).map(sa => ({
        id: sa.id,
        workflow_run_id: sa.workflow_run_id,
        workflow_id: sa.workflow_id,
        user_id: sa.user_id,
        action_id: sa.action_id,
        action_type: sa.action_type,
        action_config: sa.action_config as Record<string, any>,
        trigger_data: sa.trigger_data as Record<string, any>,
        scheduled_for: sa.scheduled_for,
        status: sa.status as ScheduledAction['status'],
        result: sa.result as Record<string, any> | null,
        error_message: sa.error_message,
        created_at: sa.created_at,
        executed_at: sa.executed_at,
      }));

      setScheduledActions(transformedData);
    } catch (error) {
      console.error('Error fetching scheduled actions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchScheduledActions();
  }, [fetchScheduledActions]);

  const cancelScheduledAction = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('scheduled_actions')
        .update({ status: 'cancelled' })
        .eq('id', id);

      if (error) throw error;

      setScheduledActions(prev => prev.map(sa =>
        sa.id === id ? { ...sa, status: 'cancelled' as const } : sa
      ));

      return true;
    } catch (error) {
      console.error('Error cancelling scheduled action:', error);
      return false;
    }
  };

  const pendingCount = scheduledActions.filter(sa => sa.status === 'pending').length;

  return {
    scheduledActions,
    isLoading,
    cancelScheduledAction,
    refetch: fetchScheduledActions,
    pendingCount,
  };
}
