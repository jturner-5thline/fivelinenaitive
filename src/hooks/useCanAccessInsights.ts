import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const PAGE_KEY = 'insights';

/**
 * Returns true if the current user's email is in the `page_access_allowlist`
 * table for the Insights page. Admins can update the allowlist without a
 * code change.
 */
export function useCanAccessInsights(): boolean {
  return useCanAccessInsightsStatus().allowed;
}

export function useCanAccessInsightsStatus(): { allowed: boolean; isLoading: boolean } {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() ?? null;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['page-access-allowlist', PAGE_KEY, email],
    queryFn: async () => {
      if (!email) return false;
      const { data, error } = await supabase
        .from('page_access_allowlist')
        .select('email')
        .eq('page_key', PAGE_KEY);
      if (error) {
        console.error('Failed to load insights allowlist:', error);
        return false;
      }
      return (data ?? []).some(
        (row) => (row.email ?? '').toLowerCase() === email,
      );
    },
    enabled: !!email,
    // Always re-evaluate the allowlist on mount so a freshly-added user sees
    // the Insights button immediately after a hard refresh, without waiting
    // for a long-lived cached result to expire.
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });

  return {
    allowed: !!data,
    isLoading: !!email && (isLoading || (data === undefined && isFetching)),
  };
}
