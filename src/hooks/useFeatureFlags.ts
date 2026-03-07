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
  const { data: flags, isLoading: flagsLoading } = useFeatureFlags();
  
  const is5thLineUser = user?.email?.endsWith('@5thline.co') ?? false;
  const isDemoAccount = user?.email === 'demo@5thline.co';
  
  const pageFlags = flags?.filter(f => f.name.startsWith('page_')) ?? [];
  
  const isJames = user?.email === 'jturner@5thline.co';

  // Fetch company-level overrides for the current user's company
  const { data: companyOverrides, isLoading: overridesLoading } = useQuery({
    queryKey: ['company-feature-overrides-mine', user?.id],
    queryFn: async () => {
      // Get user's company first
      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user!.id)
        .limit(1)
        .maybeSingle();
      
      if (!membership?.company_id) return null;
      
      const { data, error } = await supabase
        .from('company_feature_overrides')
        .select('feature_key, is_enabled')
        .eq('company_id', membership.company_id);
      
      if (error) {
        console.error('Error loading company feature overrides:', error);
        return null;
      }
      
      const map: Record<string, boolean> = {};
      (data ?? []).forEach(row => { map[row.feature_key] = row.is_enabled; });
      return map;
    },
    enabled: !!user?.id && !is5thLineUser, // 5thLine users bypass company overrides
    staleTime: 60_000,
  });

  const isLoading = flagsLoading || overridesLoading;
  
  const hasPageAccess = (pageName: string): boolean => {
    // Demo account cannot access finance page
    if (isDemoAccount && pageName === 'finance') return false;

    // Check company-level override first (non-5thLine users only)
    if (!is5thLineUser && companyOverrides) {
      const featureKey = pageName.startsWith('page_') ? pageName : `page_${pageName}`;
      // Also check non-page feature keys directly (e.g. chat_widget, copilot_widget)
      const overrideKey = featureKey in companyOverrides ? featureKey : pageName;
      if (overrideKey in companyOverrides) {
        if (!companyOverrides[overrideKey]) return false;
      }
    }
    
    const flag = pageFlags.find(f => f.name === `page_${pageName}`);
    
    if (!flag) {
      // For non-page features (chat_widget, copilot_widget, etc.), check directly
      const directFlag = flags?.find(f => f.name === pageName);
      if (!directFlag) return true;
      
      if (directFlag.status === 'james_only') return isJames;
      if (is5thLineUser) return directFlag.status === 'deployed' || directFlag.status === 'staging';
      return directFlag.status === 'deployed';
    }
    
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
