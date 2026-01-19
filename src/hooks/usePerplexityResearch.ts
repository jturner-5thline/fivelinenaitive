import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ResearchResult {
  content: string;
  citations: string[];
  timestamp: string;
}

interface LenderMatchingParams {
  companyName: string;
  industry: string;
  dealValue: number;
  dealType: string;
  location?: string;
  revenueRange?: string;
  existingLenders?: string[];
}

interface CompetitiveIntelParams {
  companyName: string;
  industry: string;
  competitors?: string[];
}

interface MarketSizingParams {
  industry: string;
  subSegment?: string;
  geography?: string;
}

interface TermSheetBenchmarkParams {
  dealType: string;
  dealSize: number;
  industry: string;
  proposedRate?: number;
  proposedTerm?: string;
  covenants?: string[];
}

interface SecFilingsParams {
  companyName: string;
  ticker?: string;
  filingTypes?: string[];
  query?: string;
}

interface RateTrackingParams {
  loanType?: string;
  dealSize?: string;
  creditQuality?: string;
}

// Cache for research results
const researchCache: Map<string, { result: ResearchResult; expiry: number }> = new Map();
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

function getCacheKey(functionName: string, params: object): string {
  return `${functionName}:${JSON.stringify(params)}`;
}

export function usePerplexityResearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callFunction = useCallback(async <T extends object>(
    functionName: string,
    params: T,
    skipCache = false
  ): Promise<ResearchResult | null> => {
    const cacheKey = getCacheKey(functionName, params);
    
    // Check cache
    if (!skipCache) {
      const cached = researchCache.get(cacheKey);
      if (cached && cached.expiry > Date.now()) {
        return cached.result;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(functionName, {
        body: params,
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const result: ResearchResult = {
        content: data.content,
        citations: data.citations || [],
        timestamp: data.timestamp,
      };

      // Cache the result
      researchCache.set(cacheKey, {
        result,
        expiry: Date.now() + CACHE_DURATION_MS,
      });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Research failed';
      setError(message);
      toast.error('Research failed', { description: message });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getLenderMatching = useCallback(
    (params: LenderMatchingParams, skipCache = false) => 
      callFunction('lender-matching-ai', params, skipCache),
    [callFunction]
  );

  const getCompetitiveIntel = useCallback(
    (params: CompetitiveIntelParams, skipCache = false) => 
      callFunction('competitive-intel', params, skipCache),
    [callFunction]
  );

  const getMarketSizing = useCallback(
    (params: MarketSizingParams, skipCache = false) => 
      callFunction('market-sizing', params, skipCache),
    [callFunction]
  );

  const getTermSheetBenchmark = useCallback(
    (params: TermSheetBenchmarkParams, skipCache = false) => 
      callFunction('term-sheet-benchmark', params, skipCache),
    [callFunction]
  );

  const getSecFilings = useCallback(
    (params: SecFilingsParams, skipCache = false) => 
      callFunction('sec-filings-search', params, skipCache),
    [callFunction]
  );

  const getRateTracking = useCallback(
    (params: RateTrackingParams, skipCache = false) => 
      callFunction('rate-tracking', params, skipCache),
    [callFunction]
  );

  const clearCache = useCallback((functionName?: string) => {
    if (functionName) {
      for (const key of researchCache.keys()) {
        if (key.startsWith(functionName)) {
          researchCache.delete(key);
        }
      }
    } else {
      researchCache.clear();
    }
  }, []);

  return {
    isLoading,
    error,
    getLenderMatching,
    getCompetitiveIntel,
    getMarketSizing,
    getTermSheetBenchmark,
    getSecFilings,
    getRateTracking,
    clearCache,
  };
}
