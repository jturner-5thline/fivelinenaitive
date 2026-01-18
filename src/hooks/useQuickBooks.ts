import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface QuickBooksCustomer {
  id: string;
  qb_id: string;
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
  customer_id: string | null;
  customer_name: string | null;
  txn_date: string | null;
  total_amt: number | null;
  payment_method: string | null;
  synced_at: string;
}

export interface QuickBooksSyncHistory {
  id: string;
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
      const { data, error } = await supabase.functions.invoke("quickbooks-auth", {
        body: {},
        method: "GET",
      });

      // Use URL params approach instead
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
      return response.json();
    },
    enabled: !!user,
    refetchInterval: 60000, // Check every minute
  });
}

export function useQuickBooksConnect() {
  return useMutation({
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-auth?action=authorize`,
        {
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
          },
        }
      );

      if (!response.ok) throw new Error("Failed to get auth URL");
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
    mutationFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-auth?action=disconnect`,
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
    mutationFn: async (syncType?: string) => {
      const { data, error } = await supabase.functions.invoke("quickbooks-sync", {
        body: { syncType },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["quickbooks-customers"] });
      queryClient.invalidateQueries({ queryKey: ["quickbooks-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["quickbooks-payments"] });
      queryClient.invalidateQueries({ queryKey: ["quickbooks-sync-history"] });

      const results = data.results;
      const totalSynced = Object.values(results as Record<string, { synced: number }>).reduce(
        (acc, r) => acc + r.synced,
        0
      );
      toast.success(`Synced ${totalSynced} records from QuickBooks`);
    },
    onError: (error) => {
      toast.error("Sync failed: " + error.message);
    },
  });
}

export function useQuickBooksCustomers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["quickbooks-customers", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quickbooks_customers")
        .select("*")
        .order("display_name");

      if (error) throw error;
      return data as QuickBooksCustomer[];
    },
    enabled: !!user,
  });
}

export function useQuickBooksInvoices() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["quickbooks-invoices", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quickbooks_invoices")
        .select("*")
        .order("txn_date", { ascending: false });

      if (error) throw error;
      return data as QuickBooksInvoice[];
    },
    enabled: !!user,
  });
}

export function useQuickBooksPayments() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["quickbooks-payments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quickbooks_payments")
        .select("*")
        .order("txn_date", { ascending: false });

      if (error) throw error;
      return data as QuickBooksPayment[];
    },
    enabled: !!user,
  });
}

export function useQuickBooksSyncHistory() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["quickbooks-sync-history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quickbooks_sync_history")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as QuickBooksSyncHistory[];
    },
    enabled: !!user,
  });
}
