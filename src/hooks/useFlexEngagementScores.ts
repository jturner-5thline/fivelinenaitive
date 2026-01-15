import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

// Score weights for different activity types
const SCORE_WEIGHTS: Record<string, number> = {
  flex_term_sheet_requested: 100,
  flex_nda_requested: 50,
  flex_info_requested: 30,
  flex_deal_saved: 15,
  flex_file_downloaded: 10,
  flex_deal_shared: 8,
  flex_deal_viewed: 1,
};

export interface DealFlexEngagement {
  dealId: string;
  score: number;
  level: "hot" | "warm" | "cold" | "none";
  lenderCount: number;
  hasTermSheetRequest: boolean;
  hasNdaRequest: boolean;
}

function calculateLevel(score: number): "hot" | "warm" | "cold" | "none" {
  if (score >= 50) return "hot";
  if (score >= 15) return "warm";
  if (score >= 1) return "cold";
  return "none";
}

export function useFlexEngagementScores(dealIds: string[]) {
  const query = useQuery({
    queryKey: ["flex-engagement-scores", dealIds.sort().join(",")],
    queryFn: async () => {
      if (dealIds.length === 0) return new Map<string, DealFlexEngagement>();

      // Fetch all FLEx activities for the given deals
      const { data: activities, error } = await supabase
        .from("activity_logs")
        .select("deal_id, activity_type, metadata")
        .in("deal_id", dealIds)
        .like("activity_type", "flex_%");

      if (error) {
        console.error("Error fetching FLEx engagement scores:", error);
        throw error;
      }

      // Aggregate scores by deal
      const dealScores = new Map<string, {
        score: number;
        lenders: Set<string>;
        hasTermSheetRequest: boolean;
        hasNdaRequest: boolean;
      }>();

      // Initialize all deals
      dealIds.forEach(id => {
        dealScores.set(id, {
          score: 0,
          lenders: new Set(),
          hasTermSheetRequest: false,
          hasNdaRequest: false,
        });
      });

      activities?.forEach((activity) => {
        const dealData = dealScores.get(activity.deal_id);
        if (!dealData) return;

        const weight = SCORE_WEIGHTS[activity.activity_type] || 0;
        dealData.score += weight;

        // Track unique lenders
        const metadata = activity.metadata as { lender_name?: string; lender_email?: string } | null;
        const lenderKey = metadata?.lender_name || metadata?.lender_email;
        if (lenderKey) {
          dealData.lenders.add(lenderKey);
        }

        // Track high-value requests
        if (activity.activity_type === "flex_term_sheet_requested") {
          dealData.hasTermSheetRequest = true;
        }
        if (activity.activity_type === "flex_nda_requested") {
          dealData.hasNdaRequest = true;
        }
      });

      // Convert to result format
      const result = new Map<string, DealFlexEngagement>();
      dealScores.forEach((data, dealId) => {
        result.set(dealId, {
          dealId,
          score: data.score,
          level: calculateLevel(data.score),
          lenderCount: data.lenders.size,
          hasTermSheetRequest: data.hasTermSheetRequest,
          hasNdaRequest: data.hasNdaRequest,
        });
      });

      return result;
    },
    enabled: dealIds.length > 0,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Set up real-time subscription for FLEx activities
  useEffect(() => {
    if (dealIds.length === 0) return;

    const channel = supabase
      .channel("flex-engagement-scores-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_logs",
        },
        (payload) => {
          const newActivity = payload.new as { deal_id: string; activity_type: string };
          if (
            dealIds.includes(newActivity.deal_id) &&
            newActivity.activity_type.startsWith("flex_")
          ) {
            query.refetch();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dealIds, query]);

  return query;
}

// Convenience hook to get engagement for a single deal
export function useFlexEngagementScore(dealId: string | undefined) {
  const { data, isLoading } = useFlexEngagementScores(dealId ? [dealId] : []);
  
  return {
    engagement: dealId ? data?.get(dealId) : undefined,
    isLoading,
  };
}
