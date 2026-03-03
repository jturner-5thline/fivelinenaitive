import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

/**
 * Returns the count of pending join requests for the current user's company.
 * Only returns a count if the current user is a company admin/owner.
 */
export function usePendingJoinRequestCount() {
  const { company, isAdmin } = useCompany();

  return useQuery({
    queryKey: ["pending-join-request-count", company?.id],
    queryFn: async () => {
      if (!company?.id) return 0;

      const { count, error } = await supabase
        .from("company_join_requests")
        .select("id", { count: "exact", head: true })
        .eq("company_id", company.id)
        .eq("status", "pending");

      if (error) {
        console.error("Error fetching pending join request count:", error);
        return 0;
      }

      return count || 0;
    },
    enabled: !!company?.id && isAdmin,
    staleTime: 30000,
  });
}
