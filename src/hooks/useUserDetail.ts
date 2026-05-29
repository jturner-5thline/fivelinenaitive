import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Per-user engagement detail backed by the shared `user_activity_log`
 * stream — mirrors `useDemoAccountDetail` but scoped to a single user_id.
 * Used by Admin → All Users row drill-down.
 */

export interface UserRouteUsage { path: string; count: number }
export interface UserFeatureUsage { feature: string; count: number }
export interface UserActivityEvent {
  id: string;
  event_type: string;
  event_data: any;
  created_at: string;
  company_id: string | null;
}

export interface UserDetailData {
  kpis: {
    total_sign_ins: number;
    first_login_at: string | null;
    last_login_at: string | null;
    distinct_active_days: number;
    total_events: number;
    page_views: number;
    feature_events: number;
    ai_queries: number;
    deals_touched: number;
  };
  routes: UserRouteUsage[];
  features: UserFeatureUsage[];
  events: UserActivityEvent[];
  daily_activity: Array<{ day: string; count: number }>;
  objects: {
    deals: Array<{ id: string; name: string | null; created_at: string | null }>;
  };
}

export const useUserDetail = (userId: string | null) => {
  return useQuery({
    queryKey: ["admin-user-detail", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<UserDetailData | null> => {
      if (!userId) return null;

      const { data: events } = await supabase
        .from("user_activity_log")
        .select("id, event_type, event_data, created_at, company_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20000);

      const rows = (events ?? []) as UserActivityEvent[];

      let first_login_at: string | null = null;
      let last_login_at: string | null = null;
      let total_sign_ins = 0;
      let page_views = 0;
      let feature_events = 0;
      let ai_queries = 0;
      const days = new Set<string>();
      const routeMap = new Map<string, number>();
      const featMap = new Map<string, number>();
      const dealIds = new Set<string>();

      for (const e of rows) {
        days.add(e.created_at.slice(0, 10));
        if (e.event_type === "sign_in") {
          total_sign_ins += 1;
          if (!first_login_at || e.created_at < first_login_at) first_login_at = e.created_at;
          if (!last_login_at || e.created_at > last_login_at) last_login_at = e.created_at;
        } else if (e.event_type === "page_view") {
          page_views += 1;
          const p = (e.event_data?.path as string) || (e.event_data?.route as string) || (e.event_data?.url as string) || "(unknown)";
          routeMap.set(p, (routeMap.get(p) ?? 0) + 1);
        } else if (e.event_type === "feature_used") {
          feature_events += 1;
          const f = (e.event_data?.feature as string) || (e.event_data?.name as string) || "(unspecified)";
          featMap.set(f, (featMap.get(f) ?? 0) + 1);
          if (f === "ai_query") ai_queries += 1;
        }
        const did = e.event_data?.deal_id as string | undefined;
        if (did) dealIds.add(did);
      }

      // Daily activity (last 30 days)
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const dayMap = new Map<string, number>();
      for (const e of rows) {
        if (new Date(e.created_at).getTime() < cutoff) continue;
        const day = e.created_at.slice(0, 10);
        dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
      }
      const daily_activity = Array.from(dayMap.entries())
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => a.day.localeCompare(b.day));

      // Deals touched — fetch metadata for the referenced deal ids (best-effort)
      let deals: UserDetailData["objects"]["deals"] = [];
      if (dealIds.size > 0) {
        const { data: dealRows } = await supabase
          .from("deals")
          .select("id, name, created_at")
          .in("id", Array.from(dealIds).slice(0, 200));
        deals = (dealRows ?? []) as any;
      }

      return {
        kpis: {
          total_sign_ins,
          first_login_at,
          last_login_at,
          distinct_active_days: days.size,
          total_events: rows.length,
          page_views,
          feature_events,
          ai_queries,
          deals_touched: dealIds.size,
        },
        routes: Array.from(routeMap.entries())
          .map(([path, count]) => ({ path, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 50),
        features: Array.from(featMap.entries())
          .map(([feature, count]) => ({ feature, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 50),
        events: rows.slice(0, 200),
        daily_activity,
        objects: { deals },
      };
    },
  });
};