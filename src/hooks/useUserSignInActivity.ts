import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Aggregated last sign-in timestamp per user, sourced from the shared
 * `user_activity_log` stream (event_type = 'sign_in'). Powers the
 * Admin → All Users "Sign-in Activity" filter.
 *
 * Returns a Map keyed by user_id. Users with no entry have never signed in.
 */
export const useUserSignInActivity = () => {
  return useQuery({
    queryKey: ["admin-user-signin-activity"],
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      // Pull recent sign-in events; 50k window is sufficient to surface
      // the most-recent sign_in per user across all tenants.
      const { data } = await supabase
        .from("user_activity_log")
        .select("user_id, created_at")
        .eq("event_type", "sign_in")
        .order("created_at", { ascending: false })
        .limit(50000);

      const map = new Map<string, string>();
      for (const row of (data ?? []) as Array<{ user_id: string; created_at: string }>) {
        // Rows are sorted desc — first occurrence wins.
        if (!map.has(row.user_id)) map.set(row.user_id, row.created_at);
      }
      return map;
    },
  });
};