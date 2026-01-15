import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface LenderEngagement {
  lenderName: string;
  lenderEmail: string | null;
  totalActions: number;
  views: number;
  downloads: number;
  infoRequests: number;
  saves: number;
  ndaRequests: number;
  termSheetRequests: number;
  lastActivity: string;
  engagementScore: number;
  engagementLevel: "hot" | "warm" | "cold";
  downloadedFiles: string[];
}

interface ActivityMetadata {
  source?: string;
  lender_name?: string;
  lender_email?: string;
  file_name?: string;
  [key: string]: unknown;
}

// Engagement score weights
const SCORE_WEIGHTS = {
  flex_term_sheet_requested: 100,
  flex_nda_requested: 50,
  flex_info_requested: 30,
  flex_deal_saved: 15,
  flex_file_downloaded: 10,
  flex_deal_shared: 8,
  flex_deal_viewed: 1,
};

function calculateEngagementLevel(score: number): "hot" | "warm" | "cold" {
  if (score >= 50) return "hot";
  if (score >= 15) return "warm";
  return "cold";
}

export function useFlexLenderEngagement(dealId: string | undefined) {
  const query = useQuery({
    queryKey: ["flex-lender-engagement", dealId],
    queryFn: async () => {
      if (!dealId) return [];

      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("deal_id", dealId)
        .like("activity_type", "flex_%")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Group activities by lender
      const lenderMap = new Map<string, {
        lenderName: string;
        lenderEmail: string | null;
        activities: { type: string; timestamp: string; fileName?: string }[];
      }>();

      for (const activity of data || []) {
        const metadata = (activity.metadata || {}) as ActivityMetadata;
        const lenderName = metadata.lender_name || "Unknown Lender";
        const lenderEmail = metadata.lender_email || null;
        const key = lenderEmail || lenderName;

        if (!lenderMap.has(key)) {
          lenderMap.set(key, {
            lenderName,
            lenderEmail,
            activities: [],
          });
        }

        lenderMap.get(key)!.activities.push({
          type: activity.activity_type,
          timestamp: activity.created_at,
          fileName: metadata.file_name,
        });
      }

      // Calculate engagement metrics for each lender
      const engagements: LenderEngagement[] = [];

      for (const [_, lenderData] of lenderMap) {
        const activities = lenderData.activities;
        
        let views = 0;
        let downloads = 0;
        let infoRequests = 0;
        let saves = 0;
        let ndaRequests = 0;
        let termSheetRequests = 0;
        let engagementScore = 0;
        const downloadedFiles: string[] = [];

        for (const activity of activities) {
          engagementScore += SCORE_WEIGHTS[activity.type as keyof typeof SCORE_WEIGHTS] || 0;

          switch (activity.type) {
            case "flex_deal_viewed":
              views++;
              break;
            case "flex_file_downloaded":
              downloads++;
              if (activity.fileName && !downloadedFiles.includes(activity.fileName)) {
                downloadedFiles.push(activity.fileName);
              }
              break;
            case "flex_info_requested":
              infoRequests++;
              break;
            case "flex_deal_saved":
              saves++;
              break;
            case "flex_nda_requested":
              ndaRequests++;
              break;
            case "flex_term_sheet_requested":
              termSheetRequests++;
              break;
          }
        }

        engagements.push({
          lenderName: lenderData.lenderName,
          lenderEmail: lenderData.lenderEmail,
          totalActions: activities.length,
          views,
          downloads,
          infoRequests,
          saves,
          ndaRequests,
          termSheetRequests,
          lastActivity: activities[0]?.timestamp || "",
          engagementScore,
          engagementLevel: calculateEngagementLevel(engagementScore),
          downloadedFiles,
        });
      }

      // Sort by engagement score (highest first)
      engagements.sort((a, b) => b.engagementScore - a.engagementScore);

      return engagements;
    },
    enabled: !!dealId,
  });

  // Set up real-time subscription
  useEffect(() => {
    if (!dealId) return;

    const channel = supabase
      .channel(`flex-engagement-${dealId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_logs",
          filter: `deal_id=eq.${dealId}`,
        },
        (payload) => {
          // Refetch when new FLEx activity comes in
          const activityType = (payload.new as { activity_type: string }).activity_type;
          if (activityType?.startsWith("flex_")) {
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
