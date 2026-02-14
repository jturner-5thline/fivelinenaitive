import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo } from "react";
import { format, subDays, startOfDay, parseISO } from "date-fns";

export interface DealActivityStats {
  views: number;
  dataRoomAccess: number;
  infoRequests: number;
  uniqueUsers: number;
  // FLEx engagement stats
  flexViews: number;
  flexDownloads: number;
  flexInfoRequests: number;
  flexNdaRequests: number;
  flexTermSheetRequests: number;
  flexUniqueLenders: number;
}

export interface DailyActivityData {
  date: string;
  views: number;
  updates: number;
  lenderActions: number;
}

const ACTIVITY_TYPE_MAPPINGS = {
  views: ['deal_viewed', 'writeup_viewed'],
  dataRoomAccess: ['attachment_downloaded', 'attachment_viewed', 'data_room_accessed'],
  infoRequests: ['requested_item_added', 'requested_item_updated'],
  lenderActions: ['lender_added', 'lender_stage_change', 'lender_substage_change', 'lender_notes_updated'],
  updates: ['deal_updated', 'stage_change', 'value_updated', 'flex_push'],
};

// Internal activity types to exclude from charts/widgets (user-initiated actions)
const INTERNAL_ACTIVITY_TYPES = [
  'deal_created',
  'deal_updated',
  'stage_changed',
  'status_changed',
  'lender_added',
  'lender_updated',
  'lender_removed',
  'lender_deleted',
  'lender_stage_change',
  'lender_substage_change',
  'lender_notes_updated',
  'note_added',
  'status_note_added',
  'attachment_added',
  'attachment_deleted',
  'document_added',
  'milestone_added',
  'milestone_completed',
  'milestone_deleted',
  'value_updated',
  'flex_push',
];

export function useDealActivityStats(dealId: string | undefined) {
  // Fetch FLEx engagement stats from the API
  const flexQuery = useQuery({
    queryKey: ["deal-flex-engagement", dealId],
    queryFn: async () => {
      if (!dealId) return null;

      try {
        const { data, error } = await supabase.functions.invoke("fetch-flex-engagement", {
          body: { deal_id: dealId },
        });

        if (error) {
          console.error("Error fetching FLEx engagement:", error);
          return null;
        }

        return data?.engagement || null;
      } catch (err) {
        console.error("Failed to call fetch-flex-engagement:", err);
        return null;
      }
    },
    enabled: !!dealId,
    staleTime: 60_000, // Cache for 1 minute
    retry: 1,
  });

  // Fetch local activity stats (non-FLEx)
  const localQuery = useQuery({
    queryKey: ["deal-activity-stats-local", dealId],
    queryFn: async () => {
      if (!dealId) return null;

      const { data: activities, error } = await supabase
        .from("activity_logs")
        .select("activity_type, user_id, created_at, metadata")
        .eq("deal_id", dealId);

      if (error) {
        console.error("Error fetching deal activity stats:", error);
        throw error;
      }

      const stats = {
        views: 0,
        dataRoomAccess: 0,
        infoRequests: 0,
        uniqueUsers: 0,
      };

      const uniqueUserIds = new Set<string>();

      const externalActivities = activities?.filter(
        (a) => !INTERNAL_ACTIVITY_TYPES.includes(a.activity_type)
      );

      externalActivities?.forEach((activity) => {
        const type = activity.activity_type;

        if (ACTIVITY_TYPE_MAPPINGS.views.includes(type)) stats.views++;
        if (ACTIVITY_TYPE_MAPPINGS.dataRoomAccess.includes(type)) stats.dataRoomAccess++;
        if (ACTIVITY_TYPE_MAPPINGS.infoRequests.includes(type)) stats.infoRequests++;
        if (activity.user_id) uniqueUserIds.add(activity.user_id);
      });

      stats.uniqueUsers = uniqueUserIds.size;
      return stats;
    },
    enabled: !!dealId,
  });

  // Combine FLEx API stats with local stats
  const combinedData = useMemo(() => {
    const local = localQuery.data;
    const flex = flexQuery.data;

    if (!local && !flex) return null;

    const stats: DealActivityStats = {
      views: local?.views ?? 0,
      dataRoomAccess: local?.dataRoomAccess ?? 0,
      infoRequests: local?.infoRequests ?? 0,
      uniqueUsers: local?.uniqueUsers ?? 0,
      flexViews: flex?.views ?? 0,
      flexDownloads: flex?.downloads ?? 0,
      flexInfoRequests: flex?.info_requests ?? 0,
      flexNdaRequests: flex?.nda_requests ?? 0,
      flexTermSheetRequests: flex?.term_sheet_requests ?? 0,
      flexUniqueLenders: flex?.unique_lenders ?? 0,
    };

    return stats;
  }, [localQuery.data, flexQuery.data]);

  // Set up real-time subscription
  useEffect(() => {
    if (!dealId) return;

    const channel = supabase
      .channel(`deal-activity-stats-${dealId}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'activity_logs',
          filter: `deal_id=eq.${dealId}`
        },
        () => {
          localQuery.refetch();
          flexQuery.refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    data: combinedData,
    isLoading: localQuery.isLoading || flexQuery.isLoading,
    isError: localQuery.isError,
    error: localQuery.error,
    refetch: async () => {
      await Promise.all([localQuery.refetch(), flexQuery.refetch()]);
      return localQuery;
    },
  };
}

export function useDealActivityChart(dealId: string | undefined, days: number = 14) {
  const query = useQuery({
    queryKey: ["deal-activity-chart", dealId, days],
    queryFn: async () => {
      if (!dealId) return [];

      const startDate = subDays(new Date(), days - 1);
      
      // Fetch activities for the date range
      const { data: activities, error } = await supabase
        .from("activity_logs")
        .select("activity_type, created_at")
        .eq("deal_id", dealId)
        .gte("created_at", startDate.toISOString());

      if (error) {
        console.error("Error fetching deal activity chart data:", error);
        throw error;
      }

      // Group by date - only track external views now
      const activityByDate = new Map<string, { views: number }>();

      // Initialize all days
      for (let i = days - 1; i >= 0; i--) {
        const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
        activityByDate.set(date, { views: 0 });
      }

      // Filter out internal activity and count by date
      const externalActivities = activities?.filter(
        (a) => !INTERNAL_ACTIVITY_TYPES.includes(a.activity_type)
      );

      externalActivities?.forEach((activity) => {
        const date = format(parseISO(activity.created_at), 'yyyy-MM-dd');
        const existing = activityByDate.get(date);
        
        if (existing) {
          const type = activity.activity_type;
          
          // Only count external/FLEx activity types
          if (type.startsWith('flex_') || ACTIVITY_TYPE_MAPPINGS.views.includes(type)) {
            existing.views++;
          }
        }
      });

      // Convert to array format for chart
      const chartData: DailyActivityData[] = [];
      activityByDate.forEach((data, dateStr) => {
        chartData.push({
          date: format(parseISO(dateStr), 'MMM d'),
          views: data.views,
          updates: 0, // No longer tracking internal updates
          lenderActions: 0, // No longer tracking internal lender actions
        });
      });

      return chartData;
    },
    enabled: !!dealId,
  });

  // Set up real-time subscription
  useEffect(() => {
    if (!dealId) return;

    const channel = supabase
      .channel(`deal-activity-chart-${dealId}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'activity_logs',
          filter: `deal_id=eq.${dealId}`
        },
        () => query.refetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealId, query]);

  return query;
}
