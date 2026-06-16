import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * Server-backed indicator that the current session is actively being
 * impersonated by an admin. Resolves to the active row from
 * `admin_impersonation_sessions` so the banner can show the source admin
 * + target demo user. Survives reloads and route changes because state
 * lives in the database, not in browser storage.
 */
export interface ActiveImpersonation {
  id: string;
  source_admin_user_id: string;
  source_admin_email: string | null;
  target_demo_user_id: string;
  target_demo_email: string | null;
  target_demo_company_id: string | null;
  target_demo_company_name: string | null;
  started_at: string;
  expires_at: string;
}

export function useImpersonationState() {
  const { user } = useAuth();
  const { data, isLoading, refetch } = useQuery({
    enabled: !!user?.id,
    queryKey: ['impersonation-state', user?.id],
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<ActiveImpersonation | null> => {
      const { data, error } = await supabase
        .from('admin_impersonation_sessions')
        .select(
          'id, source_admin_user_id, source_admin_email, target_demo_user_id, target_demo_email, target_demo_company_id, target_demo_company_name, started_at, expires_at',
        )
        .eq('target_demo_user_id', user!.id)
        .is('ended_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return (data as ActiveImpersonation) ?? null;
    },
  });
  return { impersonation: data ?? null, isLoading, refetch };
}