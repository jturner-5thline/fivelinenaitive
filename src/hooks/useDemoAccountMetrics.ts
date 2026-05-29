import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAllCompanies } from "./useAdminData";

/**
 * Demo & Pilot account metrics.
 *
 * Restricts data collection display strictly to companies with
 * account_type in {demo, pilot, trial, partner}. Production paying
 * tenants are intentionally excluded from this surface; their
 * activity may still be logged elsewhere, but this admin panel only
 * renders demo/pilot tenants.
 */

export const DEMO_LIKE_TYPES = ["demo", "pilot", "trial", "partner"] as const;
export const isDemoLike = (t?: string | null) =>
  !!t && (DEMO_LIKE_TYPES as readonly string[]).includes(t.toLowerCase());

export interface DemoAccountRow {
  id: string;
  name: string;
  account_type: string | null;
  trial_ends_at: string | null;
  subscription_status: string | null;
  created_at: string;
  member_count: number;
  sign_ins: number;
  page_views: number;
  ai_queries: number;
  feature_events: number;
  deals: number;
  distinct_active_users: number;
  distinct_active_days: number;
  last_event_at: string | null;
  active_last_7d: boolean;
  status: 'active' | 'expired' | 'converted' | 'revoked';
}

const computeStatus = (
  account_type: string | null,
  subscription_status: string | null,
  trial_ends_at: string | null,
): DemoAccountRow['status'] => {
  const sub = (subscription_status || '').toLowerCase();
  if (sub === 'active' || sub === 'paying' || sub === 'converted') return 'converted';
  if (sub === 'revoked' || sub === 'cancelled' || sub === 'canceled') return 'revoked';
  if (trial_ends_at && new Date(trial_ends_at).getTime() < Date.now()) return 'expired';
  return 'active';
};

/** Aggregated list of demo/pilot accounts, sorted newest first. */
export const useDemoAccounts = () => {
  const companiesQ = useAllCompanies();
  const companyIds = (companiesQ.data ?? [])
    .filter((c) => isDemoLike((c as any).account_type))
    .map((c) => c.id);

  return useQuery({
    queryKey: ["admin-demo-accounts", companyIds.join(",")],
    enabled: companiesQ.isSuccess,
    staleTime: 60_000,
    queryFn: async (): Promise<DemoAccountRow[]> => {
      const demos = (companiesQ.data ?? []).filter((c) =>
        isDemoLike((c as any).account_type),
      );
      if (demos.length === 0) return [];

      const ids = demos.map((d) => d.id);

      // Pull last 10k events for these tenants — sufficient to surface
      // engagement; per-account detail sheet pulls the full slice on demand.
      const [{ data: events }, { data: deals }] = await Promise.all([
        supabase
          .from("user_activity_log")
          .select("company_id, user_id, event_type, event_data, created_at")
          .in("company_id", ids)
          .order("created_at", { ascending: false })
          .limit(10000),
        supabase.from("deals").select("id, company_id").in("company_id", ids),
      ]);

      const dealsByCompany = new Map<string, number>();
      (deals ?? []).forEach((d: any) => {
        dealsByCompany.set(d.company_id, (dealsByCompany.get(d.company_id) ?? 0) + 1);
      });

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      return demos.map((c: any): DemoAccountRow => {
        const own = (events ?? []).filter((e: any) => e.company_id === c.id);
        const sign_ins = own.filter((e) => e.event_type === "sign_in").length;
        const page_views = own.filter((e) => e.event_type === "page_view").length;
        const feature_events = own.filter((e) => e.event_type === "feature_used").length;
        const ai_queries = own.filter(
          (e) =>
            e.event_type === "feature_used" &&
            (e.event_data as any)?.feature === "ai_query",
        ).length;
        const distinct_active_users = new Set(own.map((e) => e.user_id)).size;
        const distinct_active_days = new Set(
          own.map((e) => (e.created_at as string).slice(0, 10)),
        ).size;
        const last_event_at = own[0]?.created_at ?? null;
        const active_last_7d = !!last_event_at &&
          new Date(last_event_at).getTime() >= sevenDaysAgo;

        return {
          id: c.id,
          name: c.name,
          account_type: c.account_type,
          trial_ends_at: c.trial_ends_at,
          subscription_status: c.subscription_status,
          created_at: c.created_at,
          member_count: c.member_count ?? 0,
          sign_ins,
          page_views,
          feature_events,
          ai_queries,
          deals: dealsByCompany.get(c.id) ?? 0,
          distinct_active_users,
          distinct_active_days,
          last_event_at,
          active_last_7d,
          status: computeStatus(c.account_type, c.subscription_status, c.trial_ends_at),
        };
      });
    },
  });
};

export interface DemoUserEngagement {
  user_id: string;
  display_name: string | null;
  email: string | null;
  first_login_at: string | null;
  last_login_at: string | null;
  total_logins: number;
  distinct_active_days: number;
  total_events: number;
  page_views: number;
  feature_events: number;
}

export interface RouteUsage { path: string; count: number }
export interface FeatureUsage { feature: string; count: number }
export interface ActivityEvent {
  id: string;
  user_id: string;
  display_name: string | null;
  event_type: string;
  event_data: any;
  created_at: string;
}

export interface DemoAccountDetail {
  account: DemoAccountRow;
  users: DemoUserEngagement[];
  routes: RouteUsage[];
  features: FeatureUsage[];
  events: ActivityEvent[];
  daily_activity: Array<{ day: string; count: number }>;
}

/** Detailed per-account engagement breakdown (loaded on row open). */
export const useDemoAccountDetail = (accountId: string | null) => {
  return useQuery({
    queryKey: ["admin-demo-account-detail", accountId],
    enabled: !!accountId,
    staleTime: 30_000,
    queryFn: async (): Promise<DemoAccountDetail | null> => {
      if (!accountId) return null;

      // 1. Account meta (admin RPC bypasses RLS).
      const { data: companies, error: cErr } = await supabase.rpc(
        "admin_get_all_companies",
      );
      if (cErr) throw cErr;
      const c = (companies as any[])?.find((x) => x.id === accountId);
      if (!c) return null;

      // 2. Company members via admin RPC.
      const { data: members } = await supabase.rpc(
        "admin_get_company_members",
        { _company_id: accountId },
      );

      // 3. Pull last 20k events for this tenant.
      const { data: events } = await supabase
        .from("user_activity_log")
        .select("id, user_id, event_type, event_data, created_at")
        .eq("company_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20000);

      const rows = (events ?? []) as Array<{
        id: string;
        user_id: string;
        event_type: string;
        event_data: any;
        created_at: string;
      }>;

      const memberMap = new Map<string, any>(
        ((members as any[]) ?? []).map((m) => [m.user_id, m]),
      );

      // Per-user engagement.
      const userBuckets = new Map<string, DemoUserEngagement>();
      // Seed from members so users with zero events still appear.
      ((members as any[]) ?? []).forEach((m: any) => {
        userBuckets.set(m.user_id, {
          user_id: m.user_id,
          display_name: m.display_name,
          email: m.email,
          first_login_at: null,
          last_login_at: null,
          total_logins: 0,
          distinct_active_days: 0,
          total_events: 0,
          page_views: 0,
          feature_events: 0,
        });
      });
      const userDays = new Map<string, Set<string>>();

      for (const e of rows) {
        let u = userBuckets.get(e.user_id);
        if (!u) {
          const m = memberMap.get(e.user_id);
          u = {
            user_id: e.user_id,
            display_name: m?.display_name ?? null,
            email: m?.email ?? null,
            first_login_at: null,
            last_login_at: null,
            total_logins: 0,
            distinct_active_days: 0,
            total_events: 0,
            page_views: 0,
            feature_events: 0,
          };
          userBuckets.set(e.user_id, u);
        }
        u.total_events += 1;
        if (e.event_type === "sign_in") {
          u.total_logins += 1;
          if (!u.first_login_at || e.created_at < u.first_login_at)
            u.first_login_at = e.created_at;
          if (!u.last_login_at || e.created_at > u.last_login_at)
            u.last_login_at = e.created_at;
        }
        if (e.event_type === "page_view") u.page_views += 1;
        if (e.event_type === "feature_used") u.feature_events += 1;
        const dayKey = e.created_at.slice(0, 10);
        let days = userDays.get(e.user_id);
        if (!days) {
          days = new Set();
          userDays.set(e.user_id, days);
        }
        days.add(dayKey);
      }
      userBuckets.forEach((u) => {
        u.distinct_active_days = userDays.get(u.user_id)?.size ?? 0;
      });

      // Routes (top page_view paths)
      const routeMap = new Map<string, number>();
      for (const e of rows) {
        if (e.event_type !== "page_view") continue;
        const path =
          (e.event_data?.path as string) ||
          (e.event_data?.route as string) ||
          (e.event_data?.url as string) ||
          "(unknown)";
        routeMap.set(path, (routeMap.get(path) ?? 0) + 1);
      }
      const routes: RouteUsage[] = Array.from(routeMap.entries())
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);

      // Features (top feature_used.feature values)
      const featMap = new Map<string, number>();
      for (const e of rows) {
        if (e.event_type !== "feature_used") continue;
        const feat =
          (e.event_data?.feature as string) ||
          (e.event_data?.name as string) ||
          "(unspecified)";
        featMap.set(feat, (featMap.get(feat) ?? 0) + 1);
      }
      const features: FeatureUsage[] = Array.from(featMap.entries())
        .map(([feature, count]) => ({ feature, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);

      // Daily activity (last 30 days)
      const dayMap = new Map<string, number>();
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      for (const e of rows) {
        if (new Date(e.created_at).getTime() < cutoff) continue;
        const day = e.created_at.slice(0, 10);
        dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
      }
      const daily_activity = Array.from(dayMap.entries())
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => a.day.localeCompare(b.day));

      const users = Array.from(userBuckets.values()).sort(
        (a, b) => b.total_events - a.total_events,
      );

      const events_recent: ActivityEvent[] = rows.slice(0, 200).map((e) => ({
        id: e.id,
        user_id: e.user_id,
        display_name: memberMap.get(e.user_id)?.display_name ?? null,
        event_type: e.event_type,
        event_data: e.event_data,
        created_at: e.created_at,
      }));

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const account: DemoAccountRow = {
        id: c.id,
        name: c.name,
        account_type: c.account_type,
        trial_ends_at: c.trial_ends_at,
        subscription_status: c.subscription_status,
        created_at: c.created_at,
        member_count: c.member_count ?? ((members as any[])?.length ?? 0),
        sign_ins: rows.filter((e) => e.event_type === "sign_in").length,
        page_views: rows.filter((e) => e.event_type === "page_view").length,
        feature_events: rows.filter((e) => e.event_type === "feature_used").length,
        ai_queries: rows.filter(
          (e) =>
            e.event_type === "feature_used" &&
            (e.event_data as any)?.feature === "ai_query",
        ).length,
        deals: 0,
        distinct_active_users: new Set(rows.map((e) => e.user_id)).size,
        distinct_active_days: new Set(rows.map((e) => e.created_at.slice(0, 10))).size,
        last_event_at: rows[0]?.created_at ?? null,
        active_last_7d: !!rows[0] && new Date(rows[0].created_at).getTime() >= sevenDaysAgo,
        status: computeStatus(c.account_type, c.subscription_status, c.trial_ends_at),
      };

      return { account, users, routes, features, events: events_recent, daily_activity };
    },
  });
};
