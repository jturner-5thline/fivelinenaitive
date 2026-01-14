import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const useAdminRole = () => {
  const { user } = useAuth();

  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ["admin-role", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      
      console.log("Checking admin role for user:", user.id);
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      
      if (error) {
        console.error("Error checking admin role:", error);
        return false;
      }
      
      console.log("Admin role query result:", data);
      return !!data;
    },
    enabled: !!user?.id,
    staleTime: 0, // Always refetch to ensure fresh data
    refetchOnMount: true,
  });

  return { isAdmin: isAdmin ?? false, isLoading };
};
