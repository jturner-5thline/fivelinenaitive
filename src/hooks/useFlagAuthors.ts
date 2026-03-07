import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AuthorInfo {
  displayName: string | null;
  avatarUrl: string | null;
}

export function useFlagAuthors(userIds: string[], enabled: boolean) {
  const [authors, setAuthors] = useState<Record<string, AuthorInfo>>({});

  useEffect(() => {
    if (!enabled || userIds.length === 0) return;

    const uniqueIds = [...new Set(userIds)];
    const missing = uniqueIds.filter(id => !authors[id]);
    if (missing.length === 0) return;

    const fetch = async () => {
      const { data } = await supabase
        .from('profiles_public' as any)
        .select('user_id, display_name, avatar_url')
        .in('user_id', missing);

      if (data) {
        const map: Record<string, AuthorInfo> = {};
        for (const p of data as any[]) {
          map[p.user_id] = { displayName: p.display_name, avatarUrl: p.avatar_url };
        }
        setAuthors(prev => ({ ...prev, ...map }));
      }
    };

    fetch();
  }, [userIds.join(','), enabled]);

  return authors;
}
