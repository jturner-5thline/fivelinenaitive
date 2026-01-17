import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface ActivitySummary {
  summary: string;
  highlights: string[];
  recommendations: string[];
  generatedAt: Date;
}

interface ActivityData {
  activities: Array<{ type: string; description: string; timestamp: string }>;
  lenders: Array<{ name: string; stage: string; updatedAt?: string }>;
  milestones: Array<{ title: string; completed: boolean; dueDate?: string }>;
  dealInfo: {
    company: string;
    value: number;
    stage: string;
    status: string;
  };
}

export function useActivitySummary() {
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const generateSummary = useCallback(async (data: ActivityData, period: 'day' | 'week' = 'week') => {
    setIsLoading(true);

    try {
      const { data: result, error } = await supabase.functions.invoke('generate-activity-summary', {
        body: {
          ...data,
          period,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to generate summary');
      }

      if (result.error) {
        throw new Error(result.error);
      }

      const newSummary: ActivitySummary = {
        summary: result.summary,
        highlights: result.highlights || [],
        recommendations: result.recommendations || [],
        generatedAt: new Date(),
      };

      setSummary(newSummary);
      return newSummary;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate summary';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearSummary = useCallback(() => {
    setSummary(null);
  }, []);

  return {
    summary,
    isLoading,
    generateSummary,
    clearSummary,
  };
}
