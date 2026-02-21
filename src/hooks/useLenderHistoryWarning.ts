import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PASS_REASON_LABELS, type LenderPassReasonCategory } from '@/hooks/useLenderDisqualifications';

export interface LenderHistoryMatch {
  dealId: string;
  dealName: string;
  lenderName: string;
  reasonCategory: LenderPassReasonCategory;
  reasonLabel: string;
  reasonDetails: string | null;
  dealSize: number | null;
  dealIndustry: string | null;
  dealGeography: string | null;
  createdAt: string;
}

export interface LenderHistoryWarning {
  lenderName: string;
  matches: LenderHistoryMatch[];
  matchingReasons: string[];
  totalPasses: number;
  isDismissed: boolean;
}

// High-signal reason categories that should be weighted more heavily
const HIGH_SIGNAL_REASONS: LenderPassReasonCategory[] = [
  'deal_size_mismatch',
  'industry_exclusion',
  'geographic_restriction',
  'risk_profile_concerns',
  'terms_mismatch',
];

const LOW_SIGNAL_REASONS: LenderPassReasonCategory[] = [
  'timing_issues',
  'relationship_issues',
  'other',
];

interface DealContext {
  dealId: string;
  industry?: string;
  dealSize?: number;
  geography?: string;
  dealTypes?: string[];
}

export function useLenderHistoryWarning(
  lenderName: string | null,
  dealContext: DealContext | null,
  options?: { lookbackMonths?: number; minMatches?: number }
) {
  const { user } = useAuth();
  const lookbackMonths = options?.lookbackMonths ?? 12;
  const minMatches = options?.minMatches ?? 1;

  return useQuery({
    queryKey: ['lender-history-warning', lenderName, dealContext?.dealId, lookbackMonths],
    queryFn: async (): Promise<LenderHistoryWarning | null> => {
      if (!lenderName || !dealContext) return null;

      const lookbackDate = new Date();
      lookbackDate.setMonth(lookbackDate.getMonth() - lookbackMonths);

      // Fetch disqualifications for this lender across all deals (excluding current)
      const { data: disqualifications, error } = await supabase
        .from('lender_disqualifications')
        .select('*, deals!lender_disqualifications_deal_id_fkey(company, value, id)')
        .ilike('lender_name', lenderName)
        .neq('deal_id', dealContext.dealId)
        .gte('created_at', lookbackDate.toISOString())
        .order('created_at', { ascending: false });

      if (error || !disqualifications || disqualifications.length === 0) return null;

      // Check if dismissed
      const { data: dismissal } = await supabase
        .from('lender_history_warning_dismissals')
        .select('id')
        .eq('deal_id', dealContext.dealId)
        .ilike('lender_name', lenderName)
        .maybeSingle();

      // Build matches with context comparison
      const matches: LenderHistoryMatch[] = [];
      const matchingReasonSet = new Set<string>();

      for (const dq of disqualifications) {
        const dealData = dq.deals as any;
        const reasonCategory = dq.reason_category as LenderPassReasonCategory;
        let isRelevant = false;

        // Check if this pass reason overlaps with current deal attributes
        if (HIGH_SIGNAL_REASONS.includes(reasonCategory)) {
          // Industry match
          if (reasonCategory === 'industry_exclusion' && dealContext.industry && dq.deal_industry) {
            if (dealContext.industry.toLowerCase().includes(dq.deal_industry.toLowerCase()) ||
                dq.deal_industry.toLowerCase().includes(dealContext.industry.toLowerCase())) {
              isRelevant = true;
            }
          }
          // Deal size match
          if (reasonCategory === 'deal_size_mismatch' && dealContext.dealSize && dq.deal_size) {
            const sizeDiff = Math.abs(dealContext.dealSize - dq.deal_size) / Math.max(dealContext.dealSize, dq.deal_size);
            if (sizeDiff < 0.5) isRelevant = true; // Within 50% range
          }
          // Geographic match
          if (reasonCategory === 'geographic_restriction' && dealContext.geography && dq.deal_geography) {
            if (dealContext.geography.toLowerCase().includes(dq.deal_geography.toLowerCase()) ||
                dq.deal_geography.toLowerCase().includes(dealContext.geography.toLowerCase())) {
              isRelevant = true;
            }
          }
          // Risk/terms always relevant
          if (reasonCategory === 'risk_profile_concerns' || reasonCategory === 'terms_mismatch') {
            isRelevant = true;
          }
        }

        // For low-signal, require >=2 occurrences
        if (LOW_SIGNAL_REASONS.includes(reasonCategory)) {
          const sameReasonCount = disqualifications.filter(d => d.reason_category === reasonCategory).length;
          if (sameReasonCount >= 2) isRelevant = true;
        }

        if (isRelevant) {
          const reasonLabel = PASS_REASON_LABELS[reasonCategory] || reasonCategory;
          matchingReasonSet.add(reasonLabel);
          matches.push({
            dealId: dq.deal_id,
            dealName: dealData?.company || 'Unknown Deal',
            lenderName: dq.lender_name,
            reasonCategory,
            reasonLabel,
            reasonDetails: dq.reason_details,
            dealSize: dq.deal_size,
            dealIndustry: dq.deal_industry,
            dealGeography: dq.deal_geography,
            createdAt: dq.created_at,
          });
        }
      }

      if (matches.length < minMatches) return null;

      return {
        lenderName,
        matches,
        matchingReasons: Array.from(matchingReasonSet),
        totalPasses: disqualifications.length,
        isDismissed: !!dismissal,
      };
    },
    enabled: !!lenderName && !!dealContext && !!user,
    staleTime: 60000,
  });
}

export function useDismissLenderWarning() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ dealId, lenderName }: { dealId: string; lenderName: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('lender_history_warning_dismissals')
        .upsert({
          deal_id: dealId,
          lender_name: lenderName,
          dismissed_by: user.id,
        }, { onConflict: 'deal_id,lender_name' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lender-history-warning'] });
    },
  });
}

// Bulk check for multiple lenders on a deal
export function useLenderHistoryWarnings(
  lenderNames: string[],
  dealContext: DealContext | null,
  options?: { lookbackMonths?: number; minMatches?: number }
) {
  const { user } = useAuth();
  const lookbackMonths = options?.lookbackMonths ?? 12;
  const minMatches = options?.minMatches ?? 1;

  return useQuery({
    queryKey: ['lender-history-warnings-bulk', lenderNames.sort().join(','), dealContext?.dealId, lookbackMonths],
    queryFn: async (): Promise<Map<string, LenderHistoryWarning>> => {
      const result = new Map<string, LenderHistoryWarning>();
      if (!dealContext || lenderNames.length === 0) return result;

      const lookbackDate = new Date();
      lookbackDate.setMonth(lookbackDate.getMonth() - lookbackMonths);

      // Fetch all disqualifications for these lenders
      const { data: disqualifications, error } = await supabase
        .from('lender_disqualifications')
        .select('*, deals!lender_disqualifications_deal_id_fkey(company, value, id)')
        .in('lender_name', lenderNames)
        .neq('deal_id', dealContext.dealId)
        .gte('created_at', lookbackDate.toISOString())
        .order('created_at', { ascending: false });

      if (error || !disqualifications) return result;

      // Fetch dismissals
      const { data: dismissals } = await supabase
        .from('lender_history_warning_dismissals')
        .select('lender_name')
        .eq('deal_id', dealContext.dealId)
        .in('lender_name', lenderNames);

      const dismissedSet = new Set((dismissals || []).map(d => d.lender_name.toLowerCase()));

      // Group by lender
      const byLender = new Map<string, typeof disqualifications>();
      for (const dq of disqualifications) {
        const key = dq.lender_name.toLowerCase();
        if (!byLender.has(key)) byLender.set(key, []);
        byLender.get(key)!.push(dq);
      }

      for (const [lenderKey, dqs] of byLender) {
        const matches: LenderHistoryMatch[] = [];
        const matchingReasonSet = new Set<string>();

        for (const dq of dqs) {
          const dealData = dq.deals as any;
          const reasonCategory = dq.reason_category as LenderPassReasonCategory;
          let isRelevant = false;

          if (HIGH_SIGNAL_REASONS.includes(reasonCategory)) {
            if (reasonCategory === 'industry_exclusion' && dealContext.industry && dq.deal_industry) {
              if (dealContext.industry.toLowerCase().includes(dq.deal_industry.toLowerCase()) ||
                  dq.deal_industry.toLowerCase().includes(dealContext.industry.toLowerCase())) {
                isRelevant = true;
              }
            }
            if (reasonCategory === 'deal_size_mismatch' && dealContext.dealSize && dq.deal_size) {
              const sizeDiff = Math.abs(dealContext.dealSize - dq.deal_size) / Math.max(dealContext.dealSize, dq.deal_size);
              if (sizeDiff < 0.5) isRelevant = true;
            }
            if (reasonCategory === 'geographic_restriction' && dealContext.geography && dq.deal_geography) {
              if (dealContext.geography.toLowerCase().includes(dq.deal_geography.toLowerCase()) ||
                  dq.deal_geography.toLowerCase().includes(dealContext.geography.toLowerCase())) {
                isRelevant = true;
              }
            }
            if (reasonCategory === 'risk_profile_concerns' || reasonCategory === 'terms_mismatch') {
              isRelevant = true;
            }
          }

          if (LOW_SIGNAL_REASONS.includes(reasonCategory)) {
            const sameReasonCount = dqs.filter(d => d.reason_category === reasonCategory).length;
            if (sameReasonCount >= 2) isRelevant = true;
          }

          if (isRelevant) {
            const reasonLabel = PASS_REASON_LABELS[reasonCategory] || reasonCategory;
            matchingReasonSet.add(reasonLabel);
            matches.push({
              dealId: dq.deal_id,
              dealName: dealData?.company || 'Unknown Deal',
              lenderName: dq.lender_name,
              reasonCategory,
              reasonLabel,
              reasonDetails: dq.reason_details,
              dealSize: dq.deal_size,
              dealIndustry: dq.deal_industry,
              dealGeography: dq.deal_geography,
              createdAt: dq.created_at,
            });
          }
        }

        if (matches.length >= minMatches) {
          const originalName = dqs[0].lender_name;
          result.set(originalName, {
            lenderName: originalName,
            matches,
            matchingReasons: Array.from(matchingReasonSet),
            totalPasses: dqs.length,
            isDismissed: dismissedSet.has(lenderKey),
          });
        }
      }

      return result;
    },
    enabled: lenderNames.length > 0 && !!dealContext && !!user,
    staleTime: 60000,
  });
}
