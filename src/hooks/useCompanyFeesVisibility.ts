import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompany } from '@/hooks/useCompany';
import { computeTotalFee } from '@/lib/fees';

export interface CompanyFeesVisibility {
  retainerEnabled: boolean;
  milestoneEnabled: boolean;
  totalEnabled: true;
  totalFeeComputedOnly: boolean;
}

const DEFAULTS: CompanyFeesVisibility = {
  retainerEnabled: true,
  milestoneEnabled: true,
  totalEnabled: true,
  totalFeeComputedOnly: false,
};

export function useCompanyFeesVisibility(): CompanyFeesVisibility & { isLoading: boolean } {
  const { company } = useCompany();
  const companyId = company?.id ?? null;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['company_settings', companyId, 'ai_settings'],
    enabled: !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('ai_settings')
        .eq('company_id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return (data as any)?.ai_settings ?? {};
    },
  });

  // Realtime cross-tab propagation
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`company_settings_${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_settings',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ['company_settings', companyId, 'ai_settings'],
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, queryClient]);

  const fees = (data as any)?.deal_info?.fees ?? {};
  return {
    retainerEnabled: typeof fees.retainer_enabled === 'boolean' ? fees.retainer_enabled : DEFAULTS.retainerEnabled,
    milestoneEnabled: typeof fees.milestone_enabled === 'boolean' ? fees.milestone_enabled : DEFAULTS.milestoneEnabled,
    totalEnabled: true,
    totalFeeComputedOnly:
      typeof fees.total_fee_computed_only === 'boolean' ? fees.total_fee_computed_only : DEFAULTS.totalFeeComputedOnly,
    isLoading,
  };
}

export function formatComputedTotal(value: number | null | undefined, percent: number | null | undefined): string {
  if (value == null || percent == null) return '—';
  if (!Number.isFinite(value) || !Number.isFinite(percent)) return '—';
  if (value <= 0 || percent <= 0) return '—';
  const total = computeTotalFee(value, percent);
  if (total <= 0) return '—';
  if (total >= 1000) return `$${Math.round(total).toLocaleString()}`;
  return `$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}