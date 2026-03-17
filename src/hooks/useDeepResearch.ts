import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type DeepResearchPreset = 'deep-research' | 'advanced-deep-research' | 'pro-search';

export interface DeepResearchResult {
  content: string;
  citations: string[];
  model: string;
  usage: Record<string, number> | null;
  timestamp: string;
}

interface DeepResearchParams {
  query: string;
  dealId?: string;
  preset?: DeepResearchPreset;
  instructions?: string;
  maxSteps?: number;
}

export function useDeepResearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<DeepResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runResearch = useCallback(async (params: DeepResearchParams): Promise<DeepResearchResult | null> => {
    if (!params.query?.trim()) {
      toast.error('Please enter a research query');
      return null;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('deep-research', {
        body: params,
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const res: DeepResearchResult = {
        content: data.content,
        citations: data.citations || [],
        model: data.model || params.preset || 'deep-research',
        usage: data.usage || null,
        timestamp: data.timestamp,
      };

      setResult(res);
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deep research failed';
      setError(message);
      toast.error('Deep research failed', { description: message });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    isLoading,
    result,
    error,
    runResearch,
    clearResult,
  };
}
