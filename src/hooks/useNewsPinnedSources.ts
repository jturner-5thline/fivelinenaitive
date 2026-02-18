import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useNewsPinnedSources() {
  const { user } = useAuth();
  const [pinnedSources, setPinnedSources] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    supabase
      .from('news_pinned_sources')
      .select('source_name')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (data) setPinnedSources(new Set(data.map(d => d.source_name)));
      });
  }, [user]);

  const togglePin = useCallback(async (sourceName: string) => {
    if (!user) return;
    if (pinnedSources.has(sourceName)) {
      await supabase.from('news_pinned_sources').delete().eq('user_id', user.id).eq('source_name', sourceName);
      setPinnedSources(prev => { const s = new Set(prev); s.delete(sourceName); return s; });
    } else {
      await supabase.from('news_pinned_sources').insert({ user_id: user.id, source_name: sourceName });
      setPinnedSources(prev => new Set(prev).add(sourceName));
    }
  }, [user, pinnedSources]);

  const isPinned = useCallback((name: string) => pinnedSources.has(name), [pinnedSources]);

  return { pinnedSources, isPinned, togglePin };
}
