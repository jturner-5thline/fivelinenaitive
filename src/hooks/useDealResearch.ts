import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export type ResearchType = 'company' | 'lender' | 'industry';

export interface ResearchResult {
  content: string;
  citations: string[];
  researchType: ResearchType;
  timestamp: string;
}

interface ResearchCache {
  [key: string]: {
    result: ResearchResult;
    expiresAt: number;
  };
}

// Cache results for 1 hour
const CACHE_DURATION_MS = 60 * 60 * 1000;
const researchCache: ResearchCache = {};

export function useDealResearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null);

  const getCacheKey = (params: {
    companyName?: string;
    lenderName?: string;
    industry?: string;
    researchType: ResearchType;
  }) => {
    return `${params.researchType}:${params.companyName || params.lenderName || params.industry}`;
  };

  const fetchResearch = useCallback(async (params: {
    companyName?: string;
    companyUrl?: string;
    industry?: string;
    dealValue?: number;
    researchType: ResearchType;
    lenderName?: string;
  }) => {
    const cacheKey = getCacheKey(params);
    
    // Check cache first
    const cached = researchCache[cacheKey];
    if (cached && cached.expiresAt > Date.now()) {
      setResult(cached.result);
      return cached.result;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('deal-research', {
        body: params,
      });

      if (fnError) {
        throw new Error(fnError.message || 'Failed to fetch research');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      const researchResult: ResearchResult = {
        content: data.content,
        citations: data.citations || [],
        researchType: data.researchType,
        timestamp: data.timestamp,
      };

      // Cache the result
      researchCache[cacheKey] = {
        result: researchResult,
        expiresAt: Date.now() + CACHE_DURATION_MS,
      };

      setResult(researchResult);
      return researchResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch research';
      setError(message);
      toast({
        title: 'Research Failed',
        description: message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearCache = useCallback((cacheKey?: string) => {
    if (cacheKey) {
      delete researchCache[cacheKey];
    } else {
      Object.keys(researchCache).forEach(key => delete researchCache[key]);
    }
  }, []);

  return {
    fetchResearch,
    result,
    isLoading,
    error,
    clearCache,
  };
}
