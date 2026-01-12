import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SystemStats {
  total_users: number;
  total_companies: number;
  total_deals: number;
  total_lenders: number;
  active_deals: number;
  waitlist_count: number;
}

interface AdminProfile {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  first_name: string;
  last_name: string;
  avatar_url: string;
  created_at: string;
  onboarding_completed: boolean;
}

interface AdminCompany {
  id: string;
  name: string;
  logo_url: string;
  website_url: string;
  industry: string;
  employee_size: string;
  created_at: string;
  member_count: number;
  suspended_at: string | null;
  suspended_reason: string | null;
}

interface CompanyMember {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  display_name: string;
  email: string;
  avatar_url: string;
}

interface CompanyStats {
  total_deals: number;
  active_deals: number;
  total_lenders: number;
  total_deal_value: number;
}

interface CompanyActivity {
  id: string;
  deal_id: string;
  deal_name: string;
  activity_type: string;
  description: string;
  created_at: string;
  user_name: string;
}

interface AdminInvitation {
  id: string;
  company_id: string;
  company_name: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  email_status: string;
}

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  created_at: string;
}

export const useSystemStats = () => {
  return useQuery({
    queryKey: ["admin-system-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_system_stats");
      if (error) throw error;
      return (data as SystemStats[])?.[0] || null;
    },
  });
};

export const useAllProfiles = () => {
  return useQuery({
    queryKey: ["admin-all-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_profiles");
      if (error) throw error;
      return data as AdminProfile[];
    },
  });
};

export const useAllCompanies = () => {
  return useQuery({
    queryKey: ["admin-all-companies"],
    queryFn: async () => {
      // Fetch from admin RPC and also get suspension status directly
      const { data: rpcData, error: rpcError } = await supabase.rpc("admin_get_all_companies");
      if (rpcError) throw rpcError;
      
      // Get suspension info directly from companies table
      const { data: suspensionData, error: suspError } = await supabase
        .from("companies")
        .select("id, suspended_at, suspended_reason");
      if (suspError) throw suspError;
      
      const suspensionMap = new Map(suspensionData?.map(c => [c.id, c]) || []);
      
      return (rpcData as AdminCompany[]).map(company => ({
        ...company,
        suspended_at: suspensionMap.get(company.id)?.suspended_at || null,
        suspended_reason: suspensionMap.get(company.id)?.suspended_reason || null,
      }));
    },
  });
};

export const useCompanyMembers = (companyId: string | null) => {
  return useQuery({
    queryKey: ["admin-company-members", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.rpc("admin_get_company_members", { _company_id: companyId });
      if (error) throw error;
      return data as CompanyMember[];
    },
    enabled: !!companyId,
  });
};

export const useCompanyStats = (companyId: string | null) => {
  return useQuery({
    queryKey: ["admin-company-stats", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase.rpc("admin_get_company_stats", { _company_id: companyId });
      if (error) throw error;
      return (data as CompanyStats[])?.[0] || null;
    },
    enabled: !!companyId,
  });
};

export const useCompanyActivity = (companyId: string | null) => {
  return useQuery({
    queryKey: ["admin-company-activity", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase.rpc("admin_get_company_activity", { _company_id: companyId, _limit: 20 });
      if (error) throw error;
      return data as CompanyActivity[];
    },
    enabled: !!companyId,
  });
};

export const useToggleCompanySuspension = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ companyId, suspend, reason }: { companyId: string; suspend: boolean; reason?: string }) => {
      const { error } = await supabase.rpc("admin_toggle_company_suspension", { 
        _company_id: companyId, 
        _suspend: suspend, 
        _reason: reason || null 
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-companies"] });
      toast.success(variables.suspend ? "Company suspended" : "Company unsuspended");
    },
    onError: (error) => {
      toast.error("Failed to update company: " + error.message);
    },
  });
};

export const useAllInvitations = () => {
  return useQuery({
    queryKey: ["admin-all-invitations"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_all_invitations");
      if (error) throw error;
      return data as AdminInvitation[];
    },
  });
};

export const useWaitlist = () => {
  return useQuery({
    queryKey: ["admin-waitlist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waitlist")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as WaitlistEntry[];
    },
  });
};

export const useDeleteWaitlistEntry = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("waitlist").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-waitlist"] });
      queryClient.invalidateQueries({ queryKey: ["admin-system-stats"] });
      toast.success("Waitlist entry deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete entry: " + error.message);
    },
  });
};

export const useUserRoles = () => {
  return useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useAddUserRole = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "moderator" | "user" }) => {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast.success("Role added successfully");
    },
    onError: (error) => {
      toast.error("Failed to add role: " + error.message);
    },
  });
};

export const useBulkAddUserRole = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userIds, role }: { userIds: string[]; role: "admin" | "moderator" | "user" }) => {
      const inserts = userIds.map(userId => ({ user_id: userId, role }));
      const { error } = await supabase
        .from("user_roles")
        .upsert(inserts, { onConflict: "user_id,role", ignoreDuplicates: true });
      if (error) throw error;
      return userIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast.success(`Role added to ${count} user${count !== 1 ? 's' : ''}`);
    },
    onError: (error) => {
      toast.error("Failed to add roles: " + error.message);
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_delete_user", { _user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-system-stats"] });
      toast.success("User deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete user: " + error.message);
    },
  });
};

export const useRemoveUserRole = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", roleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast.success("Role removed successfully");
    },
    onError: (error) => {
      toast.error("Failed to remove role: " + error.message);
    },
  });
};
