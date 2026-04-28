import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isInternalEmail } from '@/lib/internalDomains';

/**
 * useIsTeamMemberEmail
 * --------------------
 * Returns true when the given email address belongs to either:
 *   • a known internal domain (INTERNAL_DOMAINS), or
 *   • an existing `profiles` row (i.e. someone with a workspace login).
 *
 * Used to suppress the "New contact: Add to contacts?" prompt for any
 * sender who is already a team member — they should never be suggested
 * as an external deal contact.
 */
export function useIsTeamMemberEmail(email: string | undefined | null) {
  const { user } = useAuth();
  const normalized = (email || '').trim().toLowerCase();
  const internal = isInternalEmail(normalized);

  const { data: hasProfile, isLoading } = useQuery({
    queryKey: ['is-team-member-email', normalized],
    enabled: !!user && !!normalized && normalized.includes('@') && !internal,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('email', normalized)
        .limit(1)
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
  });

  return {
    isTeamMember: internal || !!hasProfile,
    isInternalDomain: internal,
    isLoading: !internal && isLoading,
  };
}
