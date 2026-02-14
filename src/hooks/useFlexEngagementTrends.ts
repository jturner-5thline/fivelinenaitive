import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import { format, subDays, parseISO } from "date-fns";

export interface FlexDailyEngagement {
  date: string;
  views: number;
  downloads: number;
  infoRequests: number;
  ndaRequests: number;
  termSheetRequests: number;
  uniqueLenders: number;
  engagementScore: number;
}

// Activity types that actually exist in the local DB
const FLEX_ACTIVITY_TYPES = [
  'flex_push',
  'flex_data_room',
  'flex_data_room_push',
  'flex_info_request_approved',
  'flex_info_request_denied',
  'flex_deal_viewed',
  'flex_file_downloaded',
  'flex_info_requested',
  'flex_nda_requested',
  'flex_term_sheet_requested',
  'flex_deal_saved',
  'flex_writeup_viewed',
  'flex_writeup_downloaded',
  'flex_writeup_scrolled',
];

const SCORE_WEIGHTS: Record<string, number> = {
  'flex_push': 1,
  'flex_data_room': 3,
  'flex_data_room_push': 3,
  'flex_info_request_approved': 5,
  'flex_info_request_denied': 2,
  'flex_deal_viewed': 1,
  'flex_file_downloaded': 2,
  'flex_info_requested': 5,
  'flex_nda_requested': 10,
  'flex_term_sheet_requested': 15,
  'flex_deal_saved': 4,
  'flex_writeup_viewed': 3,
  'flex_writeup_downloaded': 5,
  'flex_writeup_scrolled': 4,
};

export function useFlexEngagementTrends(dealId: string | undefined, days: number = 30) {
  const query = useQuery({
    queryKey: ["flex-engagement-trends", dealId, days],
    queryFn: async () => {
      if (!dealId) return [];

      const startDate = subDays(new Date(), days - 1);

      // Fetch FLEx activities for the date range
      const { data: activities, error } = await supabase
        .from("activity_logs")
        .select("activity_type, created_at, metadata")
        .eq("deal_id", dealId)
        .in("activity_type", FLEX_ACTIVITY_TYPES)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching FLEx engagement trends:", error);
        throw error;
      }

      // Initialize all days
      const engagementByDate = new Map<string, {
        views: number;
        downloads: number;
        infoRequests: number;
        ndaRequests: number;
        termSheetRequests: number;
        lenders: Set<string>;
        engagementScore: number;
      }>();

      for (let i = days - 1; i >= 0; i--) {
        const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
        engagementByDate.set(date, {
          views: 0,
          downloads: 0,
          infoRequests: 0,
          ndaRequests: 0,
          termSheetRequests: 0,
          lenders: new Set(),
          engagementScore: 0,
        });
      }

      // Process activities
      activities?.forEach((activity) => {
        const date = format(parseISO(activity.created_at), 'yyyy-MM-dd');
        const existing = engagementByDate.get(date);
        
        if (existing) {
          const type = activity.activity_type;
          const metadata = activity.metadata as { lender_name?: string; lender_email?: string; lender?: string } | null;
          const lenderKey = metadata?.lender_name || metadata?.lender_email || metadata?.lender;
          
          // Track unique lenders
          if (lenderKey) {
            existing.lenders.add(lenderKey);
          }

          // Add to engagement score
          existing.engagementScore += SCORE_WEIGHTS[type] || 1;

          // Count by type
          if (type === 'flex_deal_viewed') {
            existing.views++;
          } else if (type === 'flex_file_downloaded' || type === 'flex_data_room' || type === 'flex_data_room_push') {
            existing.downloads++;
          } else if (type === 'flex_info_requested' || type === 'flex_info_request_approved' || type === 'flex_info_request_denied') {
            existing.infoRequests++;
          } else if (type === 'flex_nda_requested') {
            existing.ndaRequests++;
          } else if (type === 'flex_term_sheet_requested') {
            existing.termSheetRequests++;
          } else if (type === 'flex_push') {
            // Count deal syncs as general activity (views category)
            existing.views++;
          }
        }
      });

      // Convert to array format for chart
      const chartData: FlexDailyEngagement[] = [];
      engagementByDate.forEach((data, dateStr) => {
        chartData.push({
          date: format(parseISO(dateStr), 'MMM d'),
          views: data.views,
          downloads: data.downloads,
          infoRequests: data.infoRequests,
          ndaRequests: data.ndaRequests,
          termSheetRequests: data.termSheetRequests,
          uniqueLenders: data.lenders.size,
          engagementScore: data.engagementScore,
        });
      });

      return chartData;
    },
    enabled: !!dealId,
    staleTime: 30000,
  });

  // Set up real-time subscription
  useEffect(() => {
    if (!dealId) return;

    const channel = supabase
      .channel(`flex-engagement-trends-${dealId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
          filter: `deal_id=eq.${dealId}`,
        },
        (payload) => {
          const activityType = (payload.new as { activity_type: string }).activity_type;
          if (activityType?.startsWith('flex_')) {
            query.refetch();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealId, query]);

  return query;
}

// Hook to compare engagement across multiple deals
export function useFlexEngagementComparison(dealIds: string[], days: number = 30) {
  const query = useQuery({
    queryKey: ["flex-engagement-comparison", dealIds.join(','), days],
    queryFn: async () => {
      if (!dealIds.length) return [];

      const startDate = subDays(new Date(), days - 1);

      // Fetch FLEx activities for all deals
      const { data: activities, error } = await supabase
        .from("activity_logs")
        .select("deal_id, activity_type, created_at, metadata")
        .in("deal_id", dealIds)
        .in("activity_type", FLEX_ACTIVITY_TYPES)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching FLEx engagement comparison:", error);
        throw error;
      }

      // Group by deal and date
      const dealEngagement = new Map<string, Map<string, number>>();

      // Initialize for all deals and dates
      for (const dealId of dealIds) {
        const dateMap = new Map<string, number>();
        for (let i = days - 1; i >= 0; i--) {
          const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
          dateMap.set(date, 0);
        }
        dealEngagement.set(dealId, dateMap);
      }

      // Process activities
      activities?.forEach((activity) => {
        const date = format(parseISO(activity.created_at), 'yyyy-MM-dd');
        const dealMap = dealEngagement.get(activity.deal_id);
        
        if (dealMap) {
          const currentScore = dealMap.get(date) || 0;
          dealMap.set(date, currentScore + (SCORE_WEIGHTS[activity.activity_type] || 1));
        }
      });

      // Convert to chart-friendly format with cumulative scores
      const chartData: Array<Record<string, string | number>> = [];
      const cumulativeScores = new Map<string, number>();
      
      for (const dealId of dealIds) {
        cumulativeScores.set(dealId, 0);
      }

      for (let i = days - 1; i >= 0; i--) {
        const dateStr = format(subDays(new Date(), i), 'yyyy-MM-dd');
        const displayDate = format(subDays(new Date(), i), 'MMM d');
        
        const dataPoint: Record<string, string | number> = { date: displayDate };
        
        for (const dealId of dealIds) {
          const dealMap = dealEngagement.get(dealId);
          const dayScore = dealMap?.get(dateStr) || 0;
          const prevCumulative = cumulativeScores.get(dealId) || 0;
          const newCumulative = prevCumulative + dayScore;
          cumulativeScores.set(dealId, newCumulative);
          dataPoint[dealId] = newCumulative;
        }
        
        chartData.push(dataPoint);
      }

      return chartData;
    },
    enabled: dealIds.length > 0,
    staleTime: 30000,
  });

  return query;
}
