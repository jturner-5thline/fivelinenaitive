import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRole } from "./useAdminRole";

export type FeatureStatus = "disabled" | "staging" | "deployed";

export interface FeatureFlag {
  id: string;
  name: string;
  description: string | null;
  status: FeatureStatus;
  created_at: string;
  updated_at: string;
}

export const useFeatureFlags = () => {
  return useQuery({
    queryKey: ["feature-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("*")
        .order("name");

      if (error) throw error;
      return data as FeatureFlag[];
    },
  });
};

export const useUpdateFeatureFlag = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: FeatureStatus;
    }) => {
      const { error } = await supabase
        .from("feature_flags")
        .update({ status })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    },
  });
};

export const useCreateFeatureFlag = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      description,
      status = "disabled",
    }: {
      name: string;
      description?: string;
      status?: FeatureStatus;
    }) => {
      const { error } = await supabase.from("feature_flags").insert({
        name,
        description,
        status,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    },
  });
};

export const useDeleteFeatureFlag = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("feature_flags")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["feature-flags"] });
    },
  });
};

// Hook to check if user has access to a feature
export const useFeatureAccess = (featureName: string) => {
  const { isAdmin } = useAdminRole();
  const { data: flags, isLoading } = useFeatureFlags();

  const flag = flags?.find((f) => f.name === featureName);

  // 5thLine users (admins) always have access
  if (isAdmin) {
    return { hasAccess: true, isLoading };
  }

  // For non-admins, only deployed features are accessible
  const hasAccess = flag?.status === "deployed";

  return { hasAccess, isLoading };
};
