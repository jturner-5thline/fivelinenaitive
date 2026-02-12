import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TeamMember {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export function useTeamMembers() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);

  const fetchMembers = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('get_team_members_for_mention', {
        _user_id: user.id,
      });

      if (error) {
        console.error('Error fetching team members for mention:', error);
        return;
      }

      if (data) {
        setMembers(
          (data as any[]).map((p) => ({
            id: p.user_id,
            display_name: p.display_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
            first_name: p.first_name,
            last_name: p.last_name,
            email: p.email,
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
