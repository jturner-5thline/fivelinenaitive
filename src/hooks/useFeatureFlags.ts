import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
  const { user } = useAuth();
  const { data: flags, isLoading } = useFeatureFlags();

  const flag = flags?.find((f) => f.name === featureName);
  
  // Check if user is a 5thline.co user
  const is5thLineUser = user?.email?.endsWith('@5thline.co') ?? false;

  // 5thLine users have access to deployed and staging features
  if (is5thLineUser) {
    const hasAccess = flag?.status === "deployed" || flag?.status === "staging";
    return { hasAccess: hasAccess !== false, isLoading, is5thLineUser };
  }

  // For non-5thline users, only deployed features are accessible
  const hasAccess = flag?.status === "deployed";

  return { hasAccess, isLoading, is5thLineUser };
};

// Hook to get all page access flags
export const usePageAccessFlags = () => {
  const { user } = useAuth();
  const { data: flags, isLoading } = useFeatureFlags();
  
  const is5thLineUser = user?.email?.endsWith('@5thline.co') ?? false;
  
  const pageFlags = flags?.filter(f => f.name.startsWith('page_')) ?? [];
  
  const hasPageAccess = (pageName: string): boolean => {
    const flag = pageFlags.find(f => f.name === `page_${pageName}`);
    
    if (!flag) return true; // If no flag exists, allow access
    
    if (is5thLineUser) {
      return flag.status === 'deployed' || flag.status === 'staging';
    }
    
    return flag.status === 'deployed';
  };
  
  return { pageFlags, hasPageAccess, isLoading, is5thLineUser };
};
