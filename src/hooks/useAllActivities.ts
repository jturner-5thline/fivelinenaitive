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

interface UseAllActivitiesOptions {
  limit?: number;
  enablePagination?: boolean;
}

export function useAllActivities(options: UseAllActivitiesOptions | number = 20) {
  // Handle both old signature (number) and new signature (options object)
  const config = typeof options === 'number' 
    ? { limit: options, enablePagination: false }
    : { limit: options.limit ?? 20, enablePagination: options.enablePagination ?? false };
  
  const { limit, enablePagination } = config;
  
  const [activities, setActivities] = useState<ActivityLogWithDeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const fetchActivitiesPage = useCallback(async (pageNum: number, append: boolean = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    
    const offset = pageNum * limit;
    
    // First fetch activity logs
    const { data: activityData, error: activityError } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (activityError) {
      console.error('Error fetching activities:', activityError);
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }

    if (!activityData || activityData.length === 0) {
      if (!append) {
        setActivities([]);
      }
      setHasMore(false);
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }

    // Check if we have more pages
    setHasMore(activityData.length === limit);

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

    if (append) {
      setActivities(prev => [...prev, ...activitiesWithDeals]);
    } else {
      setActivities(activitiesWithDeals);
    }
    
    setIsLoading(false);
    setIsLoadingMore(false);
  }, [limit]);

  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchActivitiesPage(nextPage, true);
    }
  }, [isLoadingMore, hasMore, page, fetchActivitiesPage]);

  const refresh = useCallback(() => {
    setPage(0);
    setHasMore(true);
    fetchActivitiesPage(0, false);
  }, [fetchActivitiesPage]);

  useEffect(() => {
    fetchActivitiesPage(0, false);
  }, [fetchActivitiesPage]);

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
            .maybeSingle();
          
          newActivity.deal_name = dealData?.company;
          
          setActivities((prev) => {
            const newList = [newActivity, ...prev];
            // Only trim if not using pagination (dropdown use case)
            return enablePagination ? newList : newList.slice(0, limit);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [limit, enablePagination]);

  return {
    activities,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    refreshActivities: refresh,
  };
}
