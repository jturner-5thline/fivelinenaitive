import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type DeepResearchPreset = 'deep-research' | 'advanced-deep-research' | 'pro-search';
export type DeepResearchMode = 'general' | 'lender-matching' | 'task-execution';

export interface DeepResearchResult {
  content: string;
  citations: string[];
  model: string;
  mode: DeepResearchMode;
  usage: Record<string, unknown> | null;
  timestamp: string;
}

interface BaseParams {
  dealId?: string;
  preset?: DeepResearchPreset;
  maxSteps?: number;
}

interface GeneralParams extends BaseParams {
  mode?: 'general';
  query: string;
  instructions?: string;
}

interface LenderMatchingParams extends BaseParams {
  mode: 'lender-matching';
  query?: string;
  companyName?: string;
  industry?: string;
  dealValue?: number;
  dealType?: string;
  location?: string;
  revenueRange?: string;
  existingLenders?: string[];
}

interface TaskExecutionParams extends BaseParams {
  mode: 'task-execution';
  query?: string;
  taskTitle?: string;
  taskDescription?: string;
  taskContext?: string;
}

export type DeepResearchParams = GeneralParams | LenderMatchingParams | TaskExecutionParams;

export function useDeepResearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<DeepResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runResearch = useCallback(async (params: DeepResearchParams): Promise<DeepResearchResult | null> => {
    const query = params.query
      || ('taskTitle' in params ? params.taskTitle : undefined)
      || ('companyName' in params ? params.companyName : undefined)
      || '';

    if (!query?.trim() && params.mode !== 'lender-matching' && params.mode !== 'task-execution') {
      toast.error('Please enter a research query');
      return null;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('deep-research', {
        body: { ...params, query: query || params.mode },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const res: DeepResearchResult = {
        content: data.content,
        citations: data.citations || [],
        model: data.model || params.preset || 'deep-research',
        mode: data.mode || params.mode || 'general',
        usage: data.usage || null,
        timestamp: data.timestamp,
      };

      setResult(res);
      return res;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deep research failed';
      setError(message);

      if (message.includes('Rate limit')) {
        toast.error('Rate limited', { description: 'Please wait a moment and try again.' });
      } else if (message.includes('credits')) {
        toast.error('Credits exhausted', { description: 'Check your Perplexity billing.' });
      } else {
        toast.error('Deep research failed', { description: message });
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runLenderMatching = useCallback(async (params: Omit<LenderMatchingParams, 'mode'>) => {
    return runResearch({ ...params, mode: 'lender-matching' });
  }, [runResearch]);

  const runTaskExecution = useCallback(async (params: Omit<TaskExecutionParams, 'mode'>) => {
    return runResearch({ ...params, mode: 'task-execution' });
  }, [runResearch]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    isLoading,
    result,
    error,
    runResearch,
    runLenderMatching,
    runTaskExecution,
    clearResult,
  };
}
