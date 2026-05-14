import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AiRecommendation {
  lenderId: string | null;
  lenderName: string;
  matchScore: number;
  rationale: string;
  components: { type: number; size: number; industry: number; recency: number };
  tier?: string | null;
}

export interface AiRecommendationResponse {
  recommendations: AiRecommendation[];
  sufficiency: { ok: boolean; missing: string[] };
  generatedAt: string;
}

export function useAiRecommendedLenders(dealId: string | undefined, autoRun: boolean) {
  const [data, setData] = useState<AiRecommendationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skippedNames, setSkippedNames] = useState<Set<string>>(new Set());
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set());

  const fetchRecs = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: resp, error: invokeErr } = await supabase.functions.invoke('recommend-lenders', {
        body: { dealId },
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

  useEffect(() => {
    if (autoRun && dealId && !data && !loading && !error) {
      fetchRecs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, dealId]);

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