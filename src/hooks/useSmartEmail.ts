import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { hasAuthSession } from '@/lib/ai/requireSession';
import { toast } from 'sonner';

export type SmartEmailAction = 
  | 'draft_reply' 
  | 'auto_draft'
  | 'summarize_thread' 
  | 'extract_data' 
  | 'detect_signals' 
  | 'suggest_link' 
  | 'follow_up_check'
  | 'email_to_activity'
  | 'parse_term_sheet'
  | 'follow_up_sequence'
  | 'generate_draft_options';

interface UseSmartEmailOptions {
  dealId: string;
}

export function useSmartEmail({ dealId }: UseSmartEmailOptions) {
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, any>>({});

  const execute = useCallback(async (
    action: SmartEmailAction,
    emailData?: any,
    threadData?: any,
  ) => {
    setLoading(prev => ({ ...prev, [action]: true }));
    try {
      if (!(await hasAuthSession())) return null;
      const { data, error } = await supabase.functions.invoke('smart-email-ai', {
        body: { action, dealId, emailData, threadData },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return null;
      }

      setResults(prev => ({ ...prev, [action]: data.result }));
      return data.result;
    } catch (err: any) {
      const status = err?.context?.status;
      if (status === 402 || status === 429) {
        // Expected, recoverable states (out of AI credits / rate limited) — not app crashes.
        console.warn(`Smart email ${action} unavailable (${status})`);
        toast.error(
          status === 402
            ? 'AI credits are used up. Add credits to keep using AI email features.'
            : 'AI is busy right now. Please try again in a moment.',
        );
        return null;
      }
      console.error(`Smart email ${action} error:`, err);
      toast.error(`Failed to ${action.replace(/_/g, ' ')}`);
      return null;
    } finally {
      setLoading(prev => ({ ...prev, [action]: false }));
    }
  }, [dealId]);

  const clearResult = useCallback((action: SmartEmailAction) => {
    setResults(prev => {
      const next = { ...prev };
      delete next[action];
      return next;
    });
  }, []);

  return { execute, loading, results, clearResult };
}
