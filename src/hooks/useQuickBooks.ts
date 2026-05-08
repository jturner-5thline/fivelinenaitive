import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

export interface QuickBooksConnection {
  realmId: string;
  companyName: string | null;
  isExpired: boolean;
  lastSync: string | null;
}

export interface QuickBooksCustomer {
  id: string;
  qb_id: string;
  realm_id: string;
  display_name: string | null;
  company_name: string | null;
  given_name: string | null;
  family_name: string | null;
  email: string | null;
  phone: string | null;
  balance: number | null;
  active: boolean;
  synced_at: string;
}

export interface QuickBooksInvoice {
  id: string;
  qb_id: string;
  realm_id: string;
  doc_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  txn_date: string | null;
  due_date: string | null;
  total_amt: number | null;
  balance: number | null;
  status: string | null;
  synced_at: string;
}

export interface QuickBooksPayment {
  id: string;
  qb_id: string;
  realm_id: string;
  customer_id: string | null;
  customer_name: string | null;
  txn_date: string | null;
  total_amt: number | null;
  payment_method: string | null;
  synced_at: string;
}

export interface QuickBooksSyncHistory {
  id: string;
  realm_id: string;
  sync_type: string;
  status: string;
  records_synced: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export function useQuickBooksStatus() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["quickbooks-status", user?.id],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-auth?action=status`,
        {
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
          },
        }
      );

      if (!response.ok) throw new Error("Failed to check status");
      return response.json() as Promise<{
        connected: boolean;
        connections: QuickBooksConnection[];
        realmId?: string;
        isExpired?: boolean;
        lastSync?: string;
      }>;
    },
    enabled: !!user,
    refetchInterval: 60000,
  });
}

export function useQuickBooksConnect() {
  return useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.access_token) throw new Error("Not authenticated");
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-auth?action=connect`,
        {
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to get auth URL");
      }
      const data = await response.json();
      return data.authUrl;
    },
    onSuccess: (authUrl) => {
      window.location.href = authUrl;
    },
    onError: (error) => {
      toast.error("Failed to connect to QuickBooks: " + error.message);
    },
  });
}

export function useQuickBooksDisconnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (realmId?: string) => {
      const { data: session } = await supabase.auth.getSession();
      const params = new URLSearchParams({ action: "disconnect" });
      if (realmId) params.set("realmId", realmId);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-auth?${params}`,
        {
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
          },
        }
      );

      if (!response.ok) throw new Error("Failed to disconnect");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quickbooks-status"] });
      queryClient.invalidateQueries({ queryKey: ["quickbooks-customers"] });
      queryClient.invalidateQueries({ queryKey: ["quickbooks-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["quickbooks-payments"] });
      queryClient.invalidateQueries({ queryKey: ["quickbooks-sync-history"] });
      toast.success("QuickBooks disconnected");
    },
    onError: (error) => {
      toast.error("Failed to disconnect: " + error.message);
    },
  });
}

export function useQuickBooksSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params?: { syncType?: string; realmId?: string; scopes?: string[] }) => {
      const { data, error } = await supabase.functions.invoke("quickbooks-sync", {
        body: { syncType: params?.syncType, realmId: params?.realmId, scopes: params?.scopes },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["quickbooks-customers"] });
      queryClient.invalidateQueries({ queryKey: ["quickbooks-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["quickbooks-payments"] });
      queryClient.invalidateQueries({ queryKey: ["quickbooks-sync-history"] });
      queryClient.invalidateQueries({ queryKey: ["qb-revenue-window"] });
      queryClient.invalidateQueries({ queryKey: ["qb-preview-data"] });
      queryClient.invalidateQueries({ queryKey: ["qb-revenue-accounts"] });

      const totalSynced = data.totalSynced ?? 0;
      toast.success(`Synced ${totalSynced} records from QuickBooks`);
    },
    onError: (error) => {
      toast.error("Sync failed: " + error.message);
    },
  });
}

export function useQuickBooksCustomers(realmId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["quickbooks-customers", user?.id, realmId],
    queryFn: async () => {
      let query = supabase
        .from("quickbooks_customers")
        .select("*")
        .order("display_name");

      if (realmId) query = query.eq("realm_id", realmId);

      const { data, error } = await query;
      if (error) throw error;
      return data as QuickBooksCustomer[];
    },
    enabled: !!user,
  });
}

export function useQuickBooksInvoices(realmId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["quickbooks-invoices", user?.id, realmId],
    queryFn: async () => {
      let query = supabase
        .from("quickbooks_invoices")
        .select("*")
        .order("txn_date", { ascending: false });

      if (realmId) query = query.eq("realm_id", realmId);

      const { data, error } = await query;
      if (error) throw error;
      return data as QuickBooksInvoice[];
    },
    enabled: !!user,
  });
}

export function useQuickBooksPayments(realmId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["quickbooks-payments", user?.id, realmId],
    queryFn: async () => {
      let query = supabase
        .from("quickbooks_payments")
        .select("*")
        .order("txn_date", { ascending: false });

      if (realmId) query = query.eq("realm_id", realmId);

      const { data, error } = await query;
      if (error) throw error;
      return data as QuickBooksPayment[];
    },
    enabled: !!user,
  });
}

export function useQuickBooksSyncHistory(realmId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["quickbooks-sync-history", user?.id, realmId],
    queryFn: async () => {
      let query = supabase
        .from("quickbooks_sync_history")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10);

      if (realmId) query = query.eq("realm_id", realmId);

      const { data, error } = await query;
      if (error) throw error;
      return data as QuickBooksSyncHistory[];
    },
    enabled: !!user,
  });
}

/**
 * Fires a one-time auto-sync per browser session if the QuickBooks integration
 * is connected and its last sync is older than 48 hours (or has never run).
 * Acts as a client-side safety net on top of the server-side pg_cron job.
 */
const AUTO_SYNC_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export function useQuickBooksAutoSync() {
  const { data: status } = useQuickBooksStatus();
  const sync = useQuickBooksSync();
  const hasFiredAutoSync = useRef(false);

  useEffect(() => {
    if (hasFiredAutoSync.current) return;
    if (!status?.connected) return;
    if (sync.isPending) return;

    const connections = status.connections ?? [];
    const stale = connections.filter((c) => {
      if (c.isExpired) return false;
      if (!c.lastSync) return true;
      return Date.now() - new Date(c.lastSync).getTime() > AUTO_SYNC_THRESHOLD_MS;
    });

    if (stale.length === 0) return;

    hasFiredAutoSync.current = true;
    console.log(
      `[QuickBooks AutoSync] Triggering background sync for ${stale.length} stale realm(s)`,
      stale.map((c) => c.realmId),
    );
    for (const c of stale) {
      sync.mutate({ realmId: c.realmId });
    }
  }, [status, sync]);
}
