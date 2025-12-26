import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';

export interface ActivityLogWithDeal {
  id: string;
  deal_id: string;
  user_id: string | null;
  activity_type: string;
  description: string;
  metadata: Json;
  created_at: string;
  deal_name?: string;
}

export function useAllActivities(limit: number = 20) {
  const [activities, setActivities] = useState<ActivityLogWithDeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchActivities = useCallback(async () => {
    setIsLoading(true);
    
    // First fetch activity logs
    const { data: activityData, error: activityError } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (activityError) {
      console.error('Error fetching activities:', activityError);
      setIsLoading(false);
      return;
    }

    if (!activityData || activityData.length === 0) {
      setActivities([]);
      setIsLoading(false);
      return;
    }

    // Get unique deal IDs
    const dealIds = [...new Set(activityData.map(a => a.deal_id))];
    
    // Fetch deal names
    const { data: dealsData, error: dealsError } = await supabase
      .from('deals')
      .select('id, company')
      .in('id', dealIds);

    if (dealsError) {
      console.error('Error fetching deals:', dealsError);
    }

    // Map deal names to activities
    const dealNameMap = new Map(dealsData?.map(d => [d.id, d.company]) || []);
    
    const activitiesWithDeals: ActivityLogWithDeal[] = activityData.map(activity => ({
      ...activity,
      deal_name: dealNameMap.get(activity.deal_id),
    }));

    setActivities(activitiesWithDeals);
    setIsLoading(false);
  }, [limit]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Subscribe to realtime updates for all activity logs
  useEffect(() => {
    const channel = supabase
      .channel('all-activities')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
        },
        async (payload) => {
          const newActivity = payload.new as ActivityLogWithDeal;
          
          // Fetch the deal name for the new activity
          const { data: dealData } = await supabase
            .from('deals')
            .select('company')
            .eq('id', newActivity.deal_id)
            .single();
          
          newActivity.deal_name = dealData?.company;
          
          setActivities((prev) => [newActivity, ...prev].slice(0, limit));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [limit]);

  return {
    activities,
    isLoading,
    refreshActivities: fetchActivities,
  };
}
