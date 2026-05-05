import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isDemoCompanyId, DEMO_PRIMARY_EMAIL } from "@/lib/demoAccount";

// Always-on AI surfaces for the demo tenant. The Search / "Ask naitive AI"
// chat bar (chat_widget) and the floating Copilot drawer (copilot_widget)
// must work on every demo session regardless of the global feature-flag
// status or any company override, so the storyline workflows are
// demonstrable end-to-end.
const DEMO_ALWAYS_ON_FEATURES = new Set([
  "chat_widget",
  "copilot_widget",
]);
const isDemoEmail = (email?: string | null) =>
  email === DEMO_PRIMARY_EMAIL || email === "demo@example.com";

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

  // Demo tenant: AI search + Copilot are unconditionally enabled so the
  // storyline ("Search or ask naitive AI" + Copilot drawer) is always
  // available, even if the global flag is `disabled` or staging.
  if (isDemoEmail(user?.email) && DEMO_ALWAYS_ON_FEATURES.has(featureName)) {
    return { hasAccess: true, isLoading: false, is5thLineUser };
  }

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

  // Get user's company ID (or support session target company)
  const { data: effectiveCompanyId } = useQuery({
    queryKey: ['effective-company-id', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      // Check for active support session first (5thLine admins viewing as client)
      const { data: session } = await supabase
        .from('support_sessions')
        .select('target_company_id')
        .eq('support_user_id', user.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (session?.target_company_id) return session.target_company_id as string;
      
      // Otherwise get user's own company
      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      
      return (membership?.company_id as string) ?? null;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  // Fetch company-level overrides
  const { data: companyOverrides, isLoading: overridesLoading } = useQuery({
    queryKey: ['company-feature-overrides-active', effectiveCompanyId],
    queryFn: async () => {
      if (!effectiveCompanyId) return null;
      
      // Use raw REST to avoid typed client issues with new table
      const { data, error } = await (supabase as any)
        .from('company_feature_overrides')
        .select('feature_key, is_enabled')
        .eq('company_id', effectiveCompanyId);
      
      if (error) {
        console.error('Error loading company feature overrides:', error);
        return null;
      }
      
      const map: Record<string, boolean> = {};
      ((data as any[]) ?? []).forEach((row: any) => { map[row.feature_key] = row.is_enabled; });
      return map;
    },
    enabled: !!effectiveCompanyId,
    staleTime: 30_000,
  });

  const isLoading = flagsLoading || overridesLoading;
  
  const FINANCE_ALLOWED_EMAILS = [
    'jturner@5thline.co',
    'jmoffitt@5thline.co',
    'jrivera@5thline.co',
    'cminaldi@5thline.co',
    'mclark@5thline.co',
    'swilliams@5thline.co',
    'mkaleniecki@5thline.co',
  ];

  const hasPageAccess = (pageName: string): boolean => {
    // Demo account cannot access certain pages
    if (isDemoAccount && (pageName === 'finance' || pageName === 'workflows' || pageName === 'sales_bd')) return false;

    // Demo tenant: AI Search / Ask naitive AI chat + Copilot drawer are
    // unconditionally enabled so the storyline workflows always work.
    if (isDemoAccount && DEMO_ALWAYS_ON_FEATURES.has(pageName)) return true;

    // Finance page: restrict to explicit allowlist regardless of feature flag
    if (pageName === 'finance') {
      const email = user?.email?.toLowerCase() ?? '';
      return FINANCE_ALLOWED_EMAILS.includes(email);
    }

    // While flags or company overrides are still loading, block access
    // to prevent flash of unauthorized content.
    if (flagsLoading) return false;
    if (effectiveCompanyId && overridesLoading) return false;

    // Check company-level override (applies to all users including 5thLine in support mode)
    if (companyOverrides) {
      const featureKey = pageName.startsWith('page_') ? pageName : `page_${pageName}`;
      // Also check non-page feature keys directly (e.g. chat_widget, copilot_widget)
      const overrideKey = featureKey in companyOverrides ? featureKey : pageName;
      if (overrideKey in companyOverrides) {
        // For 5thLine users: if the feature is "staging" (5th Line Only), 
        // allow access even if the company override disables it.
        // This lets admins access staging features while viewing client accounts.
        if (is5thLineUser && !companyOverrides[overrideKey]) {
          const flag = pageFlags.find(f => f.name === `page_${pageName}`);
          const directFlag = flags?.find(f => f.name === pageName);
          const effectiveFlag = flag || directFlag;
          if (effectiveFlag?.status === 'staging' || effectiveFlag?.status === 'james_only') {
            if (effectiveFlag.status === 'james_only') return isJames;
            return true; // staging access for 5thLine users
          }
        }
        // Company override is the final authority — both enable AND disable
        return companyOverrides[overrideKey];
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
