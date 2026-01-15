import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FlexSyncRecord {
  id: string;
  deal_id: string;
  flex_deal_id: string | null;
  synced_by: string;
  status: string;
  error_message: string | null;
  payload: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  created_at: string;
  synced_by_profile?: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export function useFlexSyncHistory(dealId: string | undefined) {
  return useQuery({
    queryKey: ["flex-sync-history", dealId],
    queryFn: async () => {
      if (!dealId) return [];

      // Fetch sync history
      const { data: syncData, error: syncError } = await supabase
        .from("flex_sync_history")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (syncError) {
        console.error("Error fetching FLEx sync history:", syncError);
        throw syncError;
      }

      if (!syncData || syncData.length === 0) return [];

      // Get unique user IDs
      const userIds = [...new Set(syncData.map(s => s.synced_by))];

      // Fetch profiles for those users
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = new Map(
        (profiles || []).map(p => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }])
      );

      // Combine data
      return syncData.map(record => ({
        ...record,
        synced_by_profile: profileMap.get(record.synced_by) || null,
      })) as FlexSyncRecord[];
    },
    enabled: !!dealId,
  });
}

export function useLatestFlexSync(dealId: string | undefined) {
  return useQuery({
    queryKey: ["flex-sync-latest", dealId],
    queryFn: async () => {
      if (!dealId) return null;

      const { data, error } = await supabase
        .from("flex_sync_history")
        .select("*")
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error fetching latest FLEx sync:", error);
        throw error;
      }

      return data as FlexSyncRecord | null;
    },
    enabled: !!dealId,
  });
}
