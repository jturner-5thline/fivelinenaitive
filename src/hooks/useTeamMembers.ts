import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TeamMember {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export function useTeamMembers() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);

  const fetchMembers = useCallback(async () => {
    if (!user) return;

    try {
      // Get user's company
      const { data: memberData } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!memberData?.company_id) return;

      // Get all company members
      const { data: companyMembers } = await supabase
        .from('company_members')
        .select('user_id')
        .eq('company_id', memberData.company_id);

      if (!companyMembers?.length) return;

      const userIds = companyMembers.map((m) => m.user_id);

      // Get profiles via the public view
      const { data: profiles } = await supabase
        .from('profiles_public' as any)
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      if (profiles) {
        setMembers(
          (profiles as any[]).map((p) => ({
            id: p.user_id,
            display_name: p.display_name || 'Unknown',
            avatar_url: p.avatar_url,
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching team members:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return members;
}
