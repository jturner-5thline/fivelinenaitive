import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface DealResearchItem {
  id: string;
  deal_id: string;
  research_type: string;
  content: string;
  citations: string[];
  metadata: Record<string, any>;
  generated_by: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface OrchestratorResult {
  dealId: string;
  dealName: string;
  totalRequested: number;
  newlyGenerated: number;
  fromCache: number;
  failed: number;
  failedDetails?: { type: string; error: string }[];
  research: DealResearchItem[];
  timestamp: string;
}

const ALL_RESEARCH_TYPES = [
  'company',
  'industry',
  'lender_matching',
  'competitive_intel',
  'market_sizing',
  'rate_environment',
] as const;

export type ResearchType = typeof ALL_RESEARCH_TYPES[number];

export const RESEARCH_TYPE_LABELS: Record<ResearchType, string> = {
  company: 'Company Overview',
  industry: 'Industry Analysis',
  lender_matching: 'Lender Matching',
  competitive_intel: 'Competitive Intel',
  market_sizing: 'Market Sizing',
  rate_environment: 'Rate Environment',
};

// Hook to get cached research for a deal
export function useDealResearch(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deal-research', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('deal_research_cache' as any)
        .select('*')
        .eq('deal_id', dealId)
        .gt('expires_at', new Date().toISOString())
        .order('research_type');

      if (error) throw error;
      return (data || []) as unknown as DealResearchItem[];
    },
    enabled: !!dealId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook to trigger research orchestration
export function useRunDealResearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dealId,
      researchTypes,
      forceRefresh = false,
    }: {
      dealId: string;
      researchTypes?: ResearchType[];
      forceRefresh?: boolean;
    }): Promise<OrchestratorResult> => {
      const { data, error } = await supabase.functions.invoke('research-orchestrator', {
        body: { dealId, researchTypes, forceRefresh },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as OrchestratorResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deal-research', data.dealId] });
      const msg = data.failed > 0
        ? `Research completed: ${data.newlyGenerated} new, ${data.fromCache} cached, ${data.failed} failed`
        : `Research completed: ${data.newlyGenerated} new, ${data.fromCache} cached`;
      toast.success('Deal Research Complete', { description: msg });
    },
    onError: (error: Error) => {
      toast.error('Research failed', { description: error.message });
    },
  });
}

// Hook to delete/invalidate cached research
export function useInvalidateDealResearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, researchType }: { dealId: string; researchType?: string }) => {
      let query = supabase
        .from('deal_research_cache' as any)
        .delete()
        .eq('deal_id', dealId);

      if (researchType) {
        query = query.eq('research_type', researchType);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: (_, { dealId }) => {
      queryClient.invalidateQueries({ queryKey: ['deal-research', dealId] });
    },
  });
}
