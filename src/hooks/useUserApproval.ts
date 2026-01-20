import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface PendingApprovalUser {
  user_id: string;
  email: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  created_at: string;
  approval_requested_at: string | null;
}

// Check if current user is approved
export const useIsApproved = () => {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ["user-approved", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      
      const { data, error } = await supabase.rpc("is_user_approved", {
        _user_id: user.id,
      });
      
      if (error) {
        console.error("Error checking approval status:", error);
        return false;
      }
      
      return data as boolean;
    },
    enabled: !!user?.id,
    staleTime: 30000, // Cache for 30 seconds
  });
};

// Get pending approval users (admin only)
export const usePendingApprovals = () => {
  return useQuery({
    queryKey: ["pending-approvals"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_pending_approvals");
      
      if (error) {
        console.error("Error fetching pending approvals:", error);
        throw error;
      }
      
      return data as PendingApprovalUser[];
    },
  });
};

// Approve a user (admin only) - also sends notification email
export const useApproveUser = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, userEmail, userName }: { 
      userId: string; 
      userEmail: string; 
      userName?: string;
    }) => {
      const { error } = await supabase.rpc("admin_approve_user", {
        _user_id: userId,
      });
      
      if (error) throw error;
      
      // Send approval notification email
      await supabase.functions.invoke("notify-user-approved", {
        body: { user_email: userEmail, user_name: userName },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["consolidated-users"] });
      toast.success("User approved and notified");
    },
    onError: (error) => {
      console.error("Error approving user:", error);
      toast.error("Failed to approve user");
    },
  });
};

// Bulk approve users (admin only)
export const useBulkApproveUsers = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (userIds: string[]) => {
      const { data, error } = await supabase.rpc("admin_bulk_approve_users", {
        _user_ids: userIds,
      });
      
      if (error) throw error;
      
      // Send notification emails to all approved users
      const approvedUsers = data as Array<{ user_id: string; email: string; display_name: string | null }>;
      await Promise.all(
        approvedUsers.map((user) =>
          supabase.functions.invoke("notify-user-approved", {
            body: { user_email: user.email, user_name: user.display_name },
          })
        )
      );
      
      return approvedUsers.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["consolidated-users"] });
      toast.success(`${count} user(s) approved and notified`);
    },
    onError: (error) => {
      console.error("Error bulk approving users:", error);
      toast.error("Failed to approve users");
    },
  });
};

// Revoke user approval (admin only)
export const useRevokeApproval = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_revoke_approval", {
        _user_id: userId,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["all-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["consolidated-users"] });
      toast.success("User approval revoked");
    },
    onError: (error) => {
      console.error("Error revoking approval:", error);
      toast.error("Failed to revoke approval");
    },
  });
};

// Request approval for a new user (called after signup)
export const useRequestApproval = () => {
  return useMutation({
    mutationFn: async ({ userId, userEmail, userName }: { 
      userId: string; 
      userEmail: string; 
      userName?: string;
    }) => {
      const { error } = await supabase.functions.invoke("notify-admin-approval", {
        body: { user_id: userId, user_email: userEmail, user_name: userName },
      });
      
      if (error) {
        console.error("Error requesting approval:", error);
        // Don't throw - this is a notification, not critical
      }
    },
  });
};
