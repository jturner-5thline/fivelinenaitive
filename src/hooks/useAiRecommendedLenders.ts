import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AiRecommendation {
  lenderId: string | null;
  lenderName: string;
  matchScore: number;
  rationale: string;
  confidence?: number;
  components: {
    type: number;
    size: number;
    industry: number;
    recency: number;
    geography?: number;
    structure?: number;
    evidence?: number;
    semantic?: number;
    ai?: number;
  };
  tier?: string | null;
  loanTypes?: string[];
  industries?: string[];
  minDeal?: number | null;
  maxDeal?: number | null;
  active?: boolean;
  recentActivity?: boolean;
  positiveFitSignals?: string[];
  negativeFitSignals?: string[];
  matchedExclusion?: string | null;
  fitSummary?: string | null;
}

export interface AiRecommendationResponse {
  recommendations: AiRecommendation[];
  sufficiency: { ok: boolean; missing: string[] };
  generatedAt: string;
  meta?: {
    evaluated?: number;
    scored?: number;
    hardFilteredCount?: number;
    hardFilteredSample?: { name: string; reason: string }[];
    modelUsed?: string;
    weights?: Record<string, number>;
  };
}

export interface AiRecommenderCriteriaOverride {
  dealValue?: number;
  dealTypes?: string[];
  industry?: string;
  geo?: string;
}

export function useAiRecommendedLenders(
  dealId: string | undefined,
  autoRun: boolean,
  options?: {
    criteriaSignature?: string;
    criteriaOverride?: AiRecommenderCriteriaOverride;
  },
) {
  const [data, setData] = useState<AiRecommendationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skippedNames, setSkippedNames] = useState<Set<string>>(new Set());
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set());
  const overrideRef = useRef<AiRecommenderCriteriaOverride | undefined>(options?.criteriaOverride);
  overrideRef.current = options?.criteriaOverride;

  const fetchRecs = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: resp, error: invokeErr } = await supabase.functions.invoke('recommend-lenders', {
        body: { dealId, criteriaOverride: overrideRef.current },
      });
      if (invokeErr) throw invokeErr;
      setData(resp as AiRecommendationResponse);
      setSkippedNames(new Set());
      setAddedNames(new Set());
    } catch (e: any) {
      setError(e?.message || 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  // Initial autoRun
  useEffect(() => {
    if (autoRun && dealId && !data && !loading && !error) {
      fetchRecs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, dealId]);

  // Re-fetch when criteria signature changes (after initial load)
  const lastSig = useRef<string | undefined>(options?.criteriaSignature);
  useEffect(() => {
    const sig = options?.criteriaSignature;
    if (!autoRun || !dealId) return;
    if (sig === undefined) return;
    if (lastSig.current === sig) return;
    if (lastSig.current !== undefined) {
      // Criteria changed after first render — refetch
      fetchRecs();
    }
    lastSig.current = sig;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.criteriaSignature, dealId, autoRun]);

  const skip = useCallback(async (rec: AiRecommendation) => {
    if (!dealId) return;
    setSkippedNames(prev => new Set(prev).add(rec.lenderName.toLowerCase()));
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;
    const { error: insErr } = await supabase
      .from('deal_lender_recommendation_exclusions')
      .insert({
        deal_id: dealId,
        lender_name: rec.lenderName,
        lender_id: rec.lenderId,
        excluded_by: userData.user.id,
      });
    if (insErr && !/duplicate/i.test(insErr.message)) {
      toast.error('Failed to skip lender');
    }
  }, [dealId]);

  const markAdded = useCallback((name: string) => {
    setAddedNames(prev => new Set(prev).add(name.toLowerCase()));
  }, []);

  const resetExclusions = useCallback(async () => {
    if (!dealId) return;
    const { error: delErr } = await supabase
      .from('deal_lender_recommendation_exclusions')
      .delete()
      .eq('deal_id', dealId);
    if (delErr) {
      toast.error('Failed to reset exclusions');
      return;
    }
    toast.success('Exclusions cleared');
    await fetchRecs();
  }, [dealId, fetchRecs]);

  return {
    data,
    loading,
    error,
    refresh: fetchRecs,
    skip,
    markAdded,
    resetExclusions,
    skippedNames,
    addedNames,
  };
}