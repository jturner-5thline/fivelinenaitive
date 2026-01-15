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

const FLEX_ACTIVITY_TYPES = [
  'flex_deal_view',
  'flex_deal_viewed',
  'flex_dataroom_access',
  'flex_info_request',
  'flex_info_requested',
  'flex_term_sheet_request',
  'flex_term_sheet_requested',
  'flex_nda_request',
  'flex_nda_requested',
  'flex_document_download',
  'flex_file_downloaded',
  'flex_interest_expressed',
  'flex_meeting_scheduled',
  'flex_follow_up',
];

const SCORE_WEIGHTS: Record<string, number> = {
  'flex_deal_view': 1,
  'flex_deal_viewed': 1,
  'flex_dataroom_access': 3,
  'flex_info_request': 5,
  'flex_info_requested': 5,
  'flex_document_download': 2,
  'flex_file_downloaded': 2,
  'flex_interest_expressed': 8,
  'flex_term_sheet_request': 15,
  'flex_term_sheet_requested': 15,
  'flex_nda_request': 10,
  'flex_nda_requested': 10,
  'flex_meeting_scheduled': 12,
  'flex_follow_up': 4,
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
          if (type === 'flex_deal_view' || type === 'flex_deal_viewed') {
            existing.views++;
          } else if (type === 'flex_document_download' || type === 'flex_file_downloaded' || type === 'flex_dataroom_access') {
            existing.downloads++;
          } else if (type === 'flex_info_request' || type === 'flex_info_requested') {
            existing.infoRequests++;
          } else if (type === 'flex_nda_request' || type === 'flex_nda_requested') {
            existing.ndaRequests++;
          } else if (type === 'flex_term_sheet_request' || type === 'flex_term_sheet_requested') {
            existing.termSheetRequests++;
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
