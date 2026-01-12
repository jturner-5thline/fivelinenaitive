import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

export interface ActivityLog {
  id: string;
  deal_id: string;
  user_id: string | null;
  activity_type: string;
  description: string;
  metadata: Json;
  created_at: string;
}

export function useActivityLog(dealId: string | undefined) {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchActivities = useCallback(async () => {
    if (!dealId) return;
    
    setIsLoading(true);
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching activities:', error);
    } else {
      setActivities(data || []);
    }
    setIsLoading(false);
  }, [dealId]);

  // Fire-and-forget activity logging - does not block UI
  const logActivity = useCallback((
    activityType: string,
    description: string,
    metadata: Record<string, any> = {}
  ) => {
    if (!dealId) return;

    // Execute async operation without blocking
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
          .from('activity_logs')
          .insert({
            deal_id: dealId,
            user_id: user.id,
            activity_type: activityType,
            description,
            metadata,
          });

        if (error) {
          console.error('Error logging activity:', error);
        }
      } catch (err) {
        console.error('Error logging activity:', err);
      }
    })();
  }, [dealId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!dealId) return;

    const channel = supabase
      .channel(`activity-${dealId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
          filter: `deal_id=eq.${dealId}`,
        },
        (payload) => {
          setActivities((prev) => [payload.new as ActivityLog, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealId]);

  return {
    activities,
    isLoading,
    logActivity,
    refreshActivities: fetchActivities,
  };
}
