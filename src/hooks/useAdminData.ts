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
  suspended_at: string | null;
  suspended_reason: string | null;
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
  archived_at: string | null;
  archived_reason: string | null;
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

interface AuditLogEntry {
  id: string;
  admin_user_id: string;
  admin_name: string;
  admin_email: string;
  action_type: string;
  target_type: string;
  target_id: string | null;
  target_name: string | null;
  details: Record<string, unknown>;
  created_at: string;
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
      // Get profiles from RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc("admin_get_all_profiles");
      if (rpcError) throw rpcError;
      
      // Get suspension info directly from profiles table
      const { data: suspensionData, error: suspensionError } = await supabase
        .from("profiles")
        .select("user_id, suspended_at, suspended_reason");
      if (suspensionError) throw suspensionError;
      
      const suspensionMap = new Map(suspensionData?.map(p => [p.user_id, p]) || []);
      
      return (rpcData as AdminProfile[]).map(profile => ({
        ...profile,
        suspended_at: suspensionMap.get(profile.user_id)?.suspended_at || null,
        suspended_reason: suspensionMap.get(profile.user_id)?.suspended_reason || null,
      }));
    },
  });
};

export const useAllCompanies = () => {
  return useQuery({
    queryKey: ["admin-all-companies"],
    queryFn: async () => {
      // Fetch from admin RPC and also get suspension/archive status directly
      const { data: rpcData, error: rpcError } = await supabase.rpc("admin_get_all_companies");
      if (rpcError) throw rpcError;
      
      // Get suspension and archive info directly from companies table
      const { data: statusData, error: statusError } = await supabase
        .from("companies")
        .select("id, suspended_at, suspended_reason, archived_at, archived_reason");
      if (statusError) throw statusError;
      
      const statusMap = new Map(statusData?.map(c => [c.id, c]) || []);
      
      return (rpcData as AdminCompany[]).map(company => ({
        ...company,
        suspended_at: statusMap.get(company.id)?.suspended_at || null,
        suspended_reason: statusMap.get(company.id)?.suspended_reason || null,
        archived_at: statusMap.get(company.id)?.archived_at || null,
        archived_reason: statusMap.get(company.id)?.archived_reason || null,
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

export const useDeleteCompany = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (companyId: string) => {
      const { error } = await supabase.rpc("admin_delete_company", { _company_id: companyId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-companies"] });
      queryClient.invalidateQueries({ queryKey: ["admin-system-stats"] });
      toast.success("Company deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete company: " + error.message);
    },
  });
};

export const useToggleCompanyArchive = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ companyId, archive, reason }: { companyId: string; archive: boolean; reason?: string }) => {
      const { error } = await supabase.rpc("admin_archive_company", { 
        _company_id: companyId, 
        _archive: archive, 
        _reason: reason || null 
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-companies"] });
      toast.success(variables.archive ? "Company archived" : "Company unarchived");
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

export const useToggleUserSuspension = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, suspend, reason }: { userId: string; suspend: boolean; reason?: string }) => {
      const { error } = await supabase.rpc("admin_toggle_user_suspension", { 
        _user_id: userId, 
        _suspend: suspend, 
        _reason: reason || null 
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-profiles"] });
      toast.success(variables.suspend ? "User suspended" : "User unsuspended");
    },
    onError: (error) => {
      toast.error("Failed to update user: " + error.message);
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

export const useAuditLogs = (limit = 50) => {
  return useQuery({
    queryKey: ["admin-audit-logs", limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_audit_logs", { _limit: limit, _offset: 0 });
      if (error) throw error;
      return data as AuditLogEntry[];
    },
  });
};

export interface ExternalProfile {
  id: string;
  external_id: string;
  user_id: string | null;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  external_created_at: string | null;
  onboarding_completed: boolean | null;
  source_project_id: string;
  synced_at: string;
}

export const useExternalProfiles = () => {
  return useQuery({
    queryKey: ["admin-external-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_profiles")
        .select("*")
        .order("synced_at", { ascending: false });
      if (error) throw error;
      return data as ExternalProfile[];
    },
  });
};

export interface ConsolidatedUser {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  created_at: string;
  onboarding_completed: boolean;
  source: 'local' | 'external';
  source_project_id?: string;
  external_id?: string;
  suspended_at?: string | null;
  suspended_reason?: string | null;
}

export const useConsolidatedUsers = () => {
  const localProfiles = useAllProfiles();
  const externalProfiles = useExternalProfiles();

  const isLoading = localProfiles.isLoading || externalProfiles.isLoading;
  const isError = localProfiles.isError || externalProfiles.isError;

  const consolidatedUsers: ConsolidatedUser[] = [];

  // Add local profiles
  if (localProfiles.data) {
    for (const p of localProfiles.data) {
      consolidatedUsers.push({
        id: p.id,
        user_id: p.user_id,
        email: p.email,
        display_name: p.display_name,
        first_name: p.first_name,
        last_name: p.last_name,
        avatar_url: p.avatar_url,
        created_at: p.created_at,
        onboarding_completed: p.onboarding_completed,
        source: 'local',
        suspended_at: p.suspended_at,
        suspended_reason: p.suspended_reason,
      });
    }
  }

  // Add external profiles (exclude duplicates based on email)
  if (externalProfiles.data) {
    const localEmails = new Set(consolidatedUsers.map(u => u.email?.toLowerCase()).filter(Boolean));
    
    for (const p of externalProfiles.data) {
      // Skip if same email exists locally
      if (p.email && localEmails.has(p.email.toLowerCase())) {
        continue;
      }
      
      consolidatedUsers.push({
        id: p.id,
        user_id: p.user_id || p.external_id,
        email: p.email,
        display_name: p.display_name,
        first_name: p.first_name,
        last_name: p.last_name,
        avatar_url: p.avatar_url,
        created_at: p.external_created_at || p.synced_at,
        onboarding_completed: p.onboarding_completed ?? false,
        source: 'external',
        source_project_id: p.source_project_id,
        external_id: p.external_id,
      });
    }
  }

  // Sort by created_at descending
  consolidatedUsers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    data: consolidatedUsers,
    isLoading,
    isError,
    refetch: () => {
      localProfiles.refetch();
      externalProfiles.refetch();
    },
  };
};
