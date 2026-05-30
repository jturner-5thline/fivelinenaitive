import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lightweight check for whether the Claap API token is configured on the
 * backend. Used to render the "Add CLAAP_API_TOKEN" banner on Daily Rundown
 * cards and the /claap/review page when real summaries can't be fetched.
 */
export function useClaapTokenStatus() {
  const query = useQuery({
    queryKey: ['claap-token-status'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.functions.invoke('claap-status', { body: {} });
        if (error) return { tokenPresent: true }; // fail open — don't show banner on transient failure
        return { tokenPresent: Boolean((data as { token_present?: boolean })?.token_present) };
      } catch {
        return { tokenPresent: true };
      }
    },
  });
  return { tokenPresent: query.data?.tokenPresent ?? true, isLoading: query.isLoading };
}