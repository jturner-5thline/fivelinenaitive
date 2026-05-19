import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminCompanyOverride } from '@/contexts/AdminCompanyOverrideContext';

export interface CompanyFeatures {
  id: string;
  company_id: string;
  workflows_enabled: boolean;
  timeline_view_enabled: boolean;
  agreement_icon_visible: boolean;
  deal_memo_enabled: boolean;
  sample_deal_on_signup: boolean;
  /**
   * Per-company override for AI Assist email surfaces.
   *  - `true`  = force-enable for this company
   *  - `false` = force-disable for this company
   *  - `null`  = inherit tenant default (5thline.co => on, all others => off)
   */
  assist_enabled: boolean | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_FEATURES: Omit<CompanyFeatures, 'id' | 'company_id' | 'created_at' | 'updated_at'> = {
  workflows_enabled: false,
  timeline_view_enabled: false,
  agreement_icon_visible: false,
  deal_memo_enabled: false,
  sample_deal_on_signup: true,
  assist_enabled: null,
};

export function useCompanyFeatures() {
  const { user } = useAuth();
  const adminOverride = useAdminCompanyOverride();
  const is5thLine = user?.email?.endsWith('@5thline.co') ?? false;

  const { data, isLoading } = useQuery({
    queryKey: ['company-features', user?.id, adminOverride?.companyId],
    queryFn: async () => {
      if (!user?.id) return null;

      // Get the effective company ID
      let companyId = adminOverride?.companyId;
      if (!companyId) {
        const { data: membership } = await supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        companyId = membership?.company_id ?? undefined;
      }

      if (!companyId) return null;

      const { data: features, error } = await (supabase as any)
        .from('company_features')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching company features:', error);
        return null;
      }

      return features as CompanyFeatures | null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // 5th Line users always get all features enabled
  if (is5thLine) {
    return {
      features: {
        workflows_enabled: true,
        timeline_view_enabled: true,
        agreement_icon_visible: true,
        deal_memo_enabled: true,
        sample_deal_on_signup: true,
        // Assist: 5th Line default is ON, but a company-level override
        // (true/false) still wins so admins can disable it for a specific
        // 5th Line workspace.
        assist_enabled: data?.assist_enabled ?? true,
      },
      isLoading: false,
    };
  }

  return {
    features: {
      workflows_enabled: data?.workflows_enabled ?? DEFAULT_FEATURES.workflows_enabled,
      timeline_view_enabled: data?.timeline_view_enabled ?? DEFAULT_FEATURES.timeline_view_enabled,
      agreement_icon_visible: data?.agreement_icon_visible ?? DEFAULT_FEATURES.agreement_icon_visible,
      deal_memo_enabled: data?.deal_memo_enabled ?? DEFAULT_FEATURES.deal_memo_enabled,
      sample_deal_on_signup: data?.sample_deal_on_signup ?? DEFAULT_FEATURES.sample_deal_on_signup,
      // Assist: non-5th-Line tenants default to OFF. A company-level override
      // (true) can enable it; (false) keeps it off; (null) inherits the
      // tenant default below.
      assist_enabled: data?.assist_enabled ?? false,
    },
    isLoading,
  };
}

// Admin hook to fetch/update features for any company
export function useAdminCompanyFeatures(companyId: string | null) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-company-features', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data: features, error } = await (supabase as any)
        .from('company_features')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching company features:', error);
        return null;
      }
      return features as CompanyFeatures | null;
    },
    enabled: !!companyId,
  });

  const updateFeatures = useMutation({
    mutationFn: async (updates: Partial<Pick<CompanyFeatures, 'workflows_enabled' | 'timeline_view_enabled' | 'agreement_icon_visible' | 'deal_memo_enabled' | 'sample_deal_on_signup' | 'assist_enabled'>>) => {
      if (!companyId) throw new Error('No company selected');

      // Upsert: insert if not exists, update if exists
      const { error } = await (supabase as any)
        .from('company_features')
        .upsert({
          company_id: companyId,
          ...updates,
        }, { onConflict: 'company_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-company-features', companyId] });
      queryClient.invalidateQueries({ queryKey: ['company-features'] });
    },
  });

  return {
    features: data,
    isLoading,
    updateFeatures,
  };
}
