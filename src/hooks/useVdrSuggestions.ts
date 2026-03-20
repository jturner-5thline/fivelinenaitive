import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useVdrSuggestions(dealId: string, indexedCount: number) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    if (!dealId || indexedCount === 0) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('vdr-suggestions', {
        body: { deal_id: dealId },
      });
      if (!error && data?.suggestions) {
        setSuggestions(data.suggestions);
      }
    } catch (e) {
      console.error('Failed to fetch suggestions:', e);
    } finally {
      setLoading(false);
    }
  }, [dealId, indexedCount]);

  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

  return { suggestions, loading, refetch: fetchSuggestions };
}
