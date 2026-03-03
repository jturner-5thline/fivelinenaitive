import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface CompanyMatch {
  id: string;
  name: string;
  logo_url: string | null;
  primary_domain: string | null;
  member_count: number;
}

export interface JoinRequest {
  id: string;
  user_id: string;
  user_email: string;
  user_display_name: string | null;
  user_avatar_url: string | null;
  status: string;
  note: string | null;
  rejection_note: string | null;
  created_at: string;
  decision_at: string | null;
  decided_by_name: string | null;
}

// Extract domain from email
export function extractDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() || "";
}

// Find companies matching a domain
export function useFindCompaniesByDomain(domain: string | null) {
  return useQuery({
    queryKey: ["companies-by-domain", domain],
    queryFn: async () => {
      if (!domain) return [];
      const { data, error } = await supabase.rpc("find_companies_by_domain", {
        _domain: domain,
      });
      if (error) throw error;
      return (data || []) as CompanyMatch[];
    },
    enabled: !!domain,
  });
}

// Get user's own pending join requests
export function useMyJoinRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-join-requests", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("company_join_requests")
        .select("*, companies:company_id(name, logo_url)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
}

// Create a join request
export function useCreateJoinRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      companyId,
      note,
    }: {
      companyId: string;
      note?: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Check for existing pending request
      const { data: existing } = await supabase
        .from("company_join_requests")
        .select("id")
        .eq("user_id", user.id)
        .eq("company_id", companyId)
        .eq("status", "pending")
        .maybeSingle();

      if (existing) {
        throw new Error("You already have a pending request for this company");
      }

      const { error } = await supabase.from("company_join_requests").insert({
        user_id: user.id,
        company_id: companyId,
        note: note || null,
      });
      if (error) throw error;

      // Notify company admins
      await supabase.functions.invoke("notify-company-join-request", {
        body: {
          company_id: companyId,
          user_id: user.id,
          user_email: user.email,
          user_name:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email,
          note,
        },
      }).catch(console.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-join-requests"] });
      toast.success("Join request submitted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to submit join request");
    },
  });
}

// Get join requests for a company (admin)
export function useCompanyJoinRequests(companyId: string | null, status: string = "pending") {
  return useQuery({
    queryKey: ["company-join-requests", companyId, status],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.rpc("get_company_join_requests", {
        _company_id: companyId,
        _status: status === "all" ? null : status,
      });
      if (error) throw error;
      return (data || []) as JoinRequest[];
    },
    enabled: !!companyId,
  });
}

// Approve a join request
export function useApproveJoinRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, role = "member" }: { requestId: string; role?: "admin" | "member" | "owner" }) => {
      const { error } = await supabase.rpc("approve_join_request", {
        _request_id: requestId,
        _role: role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-join-requests"] });
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      toast.success("Join request approved");
    },
    onError: () => {
      toast.error("Failed to approve join request");
    },
  });
}

// Reject a join request
export function useRejectJoinRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, rejectionNote }: { requestId: string; rejectionNote?: string }) => {
      const { error } = await supabase.rpc("reject_join_request", {
        _request_id: requestId,
        _rejection_note: rejectionNote || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-join-requests"] });
      toast.success("Join request rejected");
    },
    onError: () => {
      toast.error("Failed to reject join request");
    },
  });
}
