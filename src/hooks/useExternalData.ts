import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export interface ExternalProfile {
  id: string;
  external_id: string;
  source_project_id: string;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  onboarding_completed: boolean;
  external_created_at: string | null;
  synced_at: string;
}

export interface ExternalDeal {
  id: string;
  external_id: string;
  source_project_id: string;
  user_id: string | null;
  company_id: string | null;
  company: string | null;
  value: number | null;
  stage: string | null;
  status: string | null;
  deal_type: string | null;
  borrower_name: string | null;
  property_address: string | null;
  notes: string | null;
  external_created_at: string | null;
  external_updated_at: string | null;
  synced_at: string;
}

export interface ExternalDealLender {
  id: string;
  external_id: string;
  source_project_id: string;
  deal_id: string | null;
  external_deal_id: string | null;
  name: string | null;
  stage: string | null;
  substage: string | null;
  status: string | null;
  notes: string | null;
  external_created_at: string | null;
  external_updated_at: string | null;
  synced_at: string;
}

export interface ExternalActivityLog {
  id: string;
  external_id: string;
  source_project_id: string;
  deal_id: string | null;
  external_deal_id: string | null;
  user_id: string | null;
  activity_type: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  external_created_at: string | null;
  synced_at: string;
}

export const useExternalProfiles = () => {
  const query = useQuery({
    queryKey: ["external-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_profiles")
        .select("*")
        .order("synced_at", { ascending: false });
      if (error) throw error;
      return data as ExternalProfile[];
    },
  });

  // Set up real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('external-profiles-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'external_profiles' },
        () => query.refetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query]);

  return query;
};

export const useExternalDeals = () => {
  const query = useQuery({
    queryKey: ["external-deals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_deals")
        .select("*")
        .order("synced_at", { ascending: false });
      if (error) throw error;
      return data as ExternalDeal[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('external-deals-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'external_deals' },
        () => query.refetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query]);

  return query;
};

export const useExternalDealLenders = () => {
  const query = useQuery({
    queryKey: ["external-deal-lenders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_deal_lenders")
        .select("*")
        .order("synced_at", { ascending: false });
      if (error) throw error;
      return data as ExternalDealLender[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('external-lenders-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'external_deal_lenders' },
        () => query.refetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query]);

  return query;
};

export const useExternalActivityLogs = (limit = 100) => {
  const query = useQuery({
    queryKey: ["external-activity-logs", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_activity_logs")
        .select("*")
        .order("external_created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as ExternalActivityLog[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('external-activity-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'external_activity_logs' },
        () => query.refetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query]);

  return query;
};

export const useExternalDataSummary = () => {
  return useQuery({
    queryKey: ["external-data-summary"],
    queryFn: async () => {
      const [profiles, deals, lenders, activities] = await Promise.all([
        supabase.from("external_profiles").select("id", { count: "exact", head: true }),
        supabase.from("external_deals").select("id", { count: "exact", head: true }),
        supabase.from("external_deal_lenders").select("id", { count: "exact", head: true }),
        supabase.from("external_activity_logs").select("id", { count: "exact", head: true }),
      ]);

      return {
        profiles: profiles.count ?? 0,
        deals: deals.count ?? 0,
        lenders: lenders.count ?? 0,
        activities: activities.count ?? 0,
      };
    },
  });
};
