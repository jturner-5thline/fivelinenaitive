import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type FeatureStatus = "disabled" | "staging" | "deployed" | "james_only";

export interface FeatureFlag {
  id: string;
  name: string;
  description: string | null;
  status: FeatureStatus;
  is_beta: boolean;
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
      is_beta,
    }: {
      id: string;
      status?: FeatureStatus;
      is_beta?: boolean;
    }) => {
      const updateData: Record<string, any> = {};
      if (status !== undefined) updateData.status = status;
      if (is_beta !== undefined) updateData.is_beta = is_beta;

      const { error } = await supabase
        .from("feature_flags")
        .update(updateData as any)
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
        status: status as any,
      } as any);

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
  const isJames = user?.email === 'jturner@5thline.co';

  // James-only features
  if (flag?.status === "james_only") {
    return { hasAccess: isJames, isLoading, is5thLineUser };
  }

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
  
  const isJames = user?.email === 'jturner@5thline.co';
  
  const hasPageAccess = (pageName: string): boolean => {
    const flag = pageFlags.find(f => f.name === `page_${pageName}`);
    
    if (!flag) return true; // If no flag exists, allow access
    
    if (flag.status === 'james_only') return isJames;
    
    if (is5thLineUser) {
      return flag.status === 'deployed' || flag.status === 'staging';
    }
    
    return flag.status === 'deployed';
  };

  const isPageBeta = (pageName: string): boolean => {
    const flag = pageFlags.find(f => f.name === `page_${pageName}`);
    return flag?.is_beta ?? false;
  };
  
  return { pageFlags, hasPageAccess, isPageBeta, isLoading, is5thLineUser };
};

// Hook to check beta status for any feature
export const useIsBeta = (featureName: string): boolean => {
  const { data: flags } = useFeatureFlags();
  const flag = flags?.find(f => f.name === featureName);
  return flag?.is_beta ?? false;
};
