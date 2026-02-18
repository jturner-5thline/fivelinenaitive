import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useNewsReadStatus() {
  const { user } = useAuth();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    supabase
      .from('news_read_status')
      .select('article_id')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (data) setReadIds(new Set(data.map(d => d.article_id)));
      });
  }, [user]);

  const markAsRead = useCallback(async (articleId: string) => {
    if (!user || readIds.has(articleId)) return;
    setReadIds(prev => new Set(prev).add(articleId));
    await supabase
      .from('news_read_status')
      .upsert({ user_id: user.id, article_id: articleId }, { onConflict: 'user_id,article_id' });
  }, [user, readIds]);

  const isRead = useCallback((id: string) => readIds.has(id), [readIds]);

  return { isRead, markAsRead, readCount: readIds.size };
}
